/* Cliper0 — in-browser clipper. No server: ffmpeg.wasm runs locally. */
"use strict";

const $ = (s) => document.querySelector(s);
const drop = $("#drop");
const fileInput = $("#file");
const controls = $("#controls");
const clipsEl = $("#clips");
const statusEl = $("#status");
const progress = $("#progress");
const bar = $("#bar");

let loadPromise = null; // single in-flight engine load
let sourceFile = null;
let objectUrls = [];
let running = false;    // a generate() run is in flight

// ---------- engine ----------

function loadFFmpeg() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const { FFmpeg } = FFmpegWASM;
    const { toBlobURL } = FFmpegUtil;
    const ff = new FFmpeg();
    const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ff.load({
      coreURL: await toBlobURL(base + "/ffmpeg-core.js", "text/javascript"),
      wasmURL: await toBlobURL(base + "/ffmpeg-core.wasm", "application/wasm"),
    });
    return ff;
  })().catch((e) => {
    loadPromise = null; // allow retry on failure
    throw e;
  });
  return loadPromise;
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

// ---------- file selection ----------

function pickFile(f) {
  // empty type is common on Windows for .mkv/.mov — let ffmpeg decide
  if (!f || (f.type && !f.type.startsWith("video/"))) {
    setStatus("Please choose a video file.");
    return;
  }
  sourceFile = f;
  const info = $("#fileinfo");
  info.textContent = "";
  const nameEl = document.createElement("b");
  nameEl.textContent = f.name; // filename is user input — never innerHTML
  info.append(nameEl, ` · ${(f.size / 1048576).toFixed(1)} MB` +
    (f.size > 1.2 * 1024 ** 3 ? " · large file — may run out of memory" : ""));
  controls.hidden = false;
  $("#generate").disabled = running;
  setStatus("");
}

$("#pick").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => pickFile(fileInput.files[0]));
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  pickFile(e.dataTransfer.files[0]);
});

// ---------- clip generation ----------

async function probeDuration(ff, input) {
  // `ffmpeg -i` errors out but prints Duration in its log
  let duration = 0;
  const onLog = ({ message }) => {
    const m = message.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (m) duration = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
  };
  ff.on("log", onLog);
  try { await ff.exec(["-i", input]); } catch (_) { /* expected */ }
  ff.off("log", onLog);
  return duration;
}

async function generate() {
  if (!sourceFile) return;
  const btn = $("#generate");
  btn.disabled = true;
  running = true;
  $("#reset").hidden = false;
  clearClips();

  let ff = null, input = null;
  try {
    setStatus("Loading video engine (first time only)…");
    ff = await loadFFmpeg();

    setStatus("Reading your file…");
    const ext = (sourceFile.name.match(/\.\w{2,5}$/) || [".mp4"])[0].toLowerCase();
    input = "src" + ext;
    const { fetchFile } = FFmpegUtil;
    await ff.writeFile(input, await fetchFile(sourceFile));

    setStatus("Detecting duration…");
    const duration = await probeDuration(ff, input);
    if (!duration) throw new Error("Could not read video duration.");

    const clipLen = +$("#clipLen").value;
    let count = Math.floor(duration / clipLen);
    if (count < 1) throw new Error(`Video is shorter than ${clipLen}s — pick a shorter clip length.`);
    count = Math.min(count, 20); // cap: keeps memory and time sane

    progress.hidden = false;
    setStatus(`Cutting ${count} clip${count > 1 ? "s" : ""}…`);

    for (let i = 0; i < count; i++) {
      const start = i * clipLen;
      const out = `clip_${i + 1}.mp4`;
      // shortcut: -c copy cuts at keyframes (±1s accuracy); switch to
      // libx264 re-encode here when frame-exact cuts are needed
      await ff.exec(["-ss", String(start), "-i", input, "-t", String(clipLen), "-c", "copy", out]);
      const data = await ff.readFile(out);
      const url = URL.createObjectURL(new Blob([data], { type: "video/mp4" }));
      objectUrls.push(url);
      addClip(url, start, clipLen, i + 1);
      await ff.deleteFile(out);
      bar.style.width = `${Math.round(((i + 1) / count) * 100)}%`;
    }

    setStatus(`Done — ${count} clip${count > 1 ? "s" : ""} ready. Preview or download below.`);
  } catch (e) {
    console.error(e);
    setStatus("Error: " + (e.message || e));
  } finally {
    // free the input on every exit path — on error it would otherwise stay
    // in ffmpeg's heap and double memory when the next file has another ext
    if (ff && input) await ff.deleteFile(input).catch(() => {});
    running = false;
    btn.disabled = false;
    progress.hidden = true;
    bar.style.width = "0%";
  }
}

// ---------- clip list ----------

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function addClip(url, start, len, n) {
  const el = document.createElement("div");
  el.className = "clip";
  const title = `clip-${String(n).padStart(2, "0")}.mp4`;
  el.innerHTML = `
    <video src="${url}" controls preload="metadata"></video>
    <div class="meta">
      <span>${fmt(start)} → ${fmt(start + len)}</span>
      <a href="${url}" download="${title}">Download</a>
    </div>`;
  clipsEl.appendChild(el);
}

function clearClips() {
  clipsEl.innerHTML = "";
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls = [];
}

$("#generate").addEventListener("click", generate);

$("#reset").addEventListener("click", () => {
  if (running) return; // the loop keeps writing clips; state must not be torn down
  clearClips();
  sourceFile = null;
  fileInput.value = "";
  controls.hidden = true;
  $("#reset").hidden = true;
  setStatus("");
  drop.scrollIntoView({ behavior: "smooth", block: "center" });
});

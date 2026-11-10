# Cliper0

Free, open-source video clipper that runs **entirely in your browser**.
No server, no accounts, no watermarks — your videos never leave your device.

## How it works

- Static site: `index.html` + `style.css` + `app.js` — no build step.
- Video processing: [ffmpeg.wasm](https://ffmpegwasm.netlify.app/) loaded from a CDN.
- Upload a video → pick a clip length → get up to 20 clips → preview & download.

## Run locally

Open `index.html` in a browser, or serve the folder:

```sh
npx serve .
```

## Deploy (GitHub Pages)

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Source: Deploy from a branch** → `main` / root.
3. Site appears at `https://<user>.github.io/<repo>/`.

No build, no workflow file needed.

## Known limits (v1)

- Cuts snap to keyframes (`-c copy`) — accurate to ~1s, not frame-exact.
- Up to 20 clips per run; files ~1 GB work best (browser memory).
- No YouTube-link processing (needs a server) and no AI scoring — both need
  a backend, which free static hosting can't run.

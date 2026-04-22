# LiveCut

Clip sections from HLS (`.m3u8`) streams and export them as MP4 — entirely in your browser. No uploads, no server, no installs.

**Live at:** [jaysvideo.github.io/livecut](https://jaysvideo.github.io/livecut)

---

## Features

- **Load any HLS stream** — paste a `.m3u8` URL and it loads instantly
- **Mark In / Mark Out** while the video plays (or press `I` / `O`)
- **Frame-accurate nudging** — adjust in/out points in 0.1s or 1s steps
- **Quick clip buttons** — −3s, −5s, −10s from current playhead
- **Live button** — jump to the live edge (5s behind) for live stream clipping
- **Preview** — play through any marked range before adding
- **Multi-clip workflow** — queue multiple named clips before exporting
- **Per-clip MP4 export** — stream-copy (lossless, fast)
- **Combined export** — merges all clips into one MP4 with 0.5s crossfades between them
- **Inline rename** — click any clip name to edit it
- **Automatic CORS proxy fallback** — tries direct first, proxies if blocked
- **4-minute clip limit** — warns before you hit browser memory limits
- **Stream Sniffer extension** — companion Chrome extension detects `.m3u8` URLs on any page

## RTMP / RTSP

Browsers can't play RTMP or RTSP natively. Relay to HLS locally:

```bash
# RTMP → HLS
ffmpeg -i rtmp://your-server/live/stream -c copy -f hls -hls_time 2 -hls_list_size 5 /tmp/hls/out.m3u8

# RTSP → HLS
ffmpeg -rtsp_transport tcp -i rtsp://camera/stream -c copy -f hls -hls_time 2 -hls_list_size 5 /tmp/hls/out.m3u8

# Serve with CORS (requires Node.js)
npx serve /tmp/hls --cors -l 8080
```

Then paste `http://localhost:8080/out.m3u8` into LiveCut.

## Chrome Extension

The `extension/` folder contains the **LiveCut Stream Sniffer** — a Manifest V3 Chrome extension that:

- Monitors all network requests for `.m3u8` URLs
- Also intercepts `fetch()`, `XHR`, `<video>` elements, and inline scripts
- Shows a badge count of detected streams per tab
- One-click to copy URL or open directly in LiveCut

**Install:** `chrome://extensions` → Developer mode → Load unpacked → select `extension/`

## Running Locally

```bash
npm install
npm run dev
```

Requires Node 18+. The dev server sets the required `COOP`/`COEP` headers automatically (needed for FFmpeg.wasm SharedArrayBuffer).

## Deploying

Push to `main` — GitHub Actions builds and deploys to GitHub Pages automatically.

**One-time setup:**
- Settings → Pages → Source: **GitHub Actions**
- Settings → Secrets and variables → Actions → Variables:

| Variable | Description |
|---|---|
| `PROXY_URL` | CORS proxy URL (e.g. `https://corsproxy.io/?`) |
| `GA_MEASUREMENT_ID` | Google Analytics 4 ID (optional) |

## Stack

| Layer | Library |
|---|---|
| Playback | HLS.js |
| Video processing | FFmpeg.wasm 0.12 |
| UI | React 18 + Vite |
| Cross-origin isolation | coi-serviceworker |
| Hosting | GitHub Pages |

## How exporting works

- Segment URLs and timing are read from HLS.js's already-parsed playlist — no re-fetch of the `.m3u8`
- Only segments overlapping the clip range are downloaded
- FFmpeg.wasm concatenates and trims to exact in/out points using stream copy (`-c copy`)
- For combined export, clips are re-encoded with `libx264` so the `xfade` filter can apply 0.5s crossfades
- Everything runs in the browser — nothing is sent to a server

## Contributors

Built for [jaysvideo.github.io](https://jaysvideo.github.io) — inspired by [chrissabato/livecut](https://github.com/chrissabato/livecut)

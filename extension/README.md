# LiveCut Stream Sniffer — Chrome Extension

Automatically detects HLS (`.m3u8`) stream URLs on any page and lets you open them directly in LiveCut with one click.

## Install (Developer Mode)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this `extension/` folder

## How it works

- Monitors all network requests for `.m3u8` URLs using the `webRequest` API
- Also watches `fetch()`, `XMLHttpRequest`, `<video>` elements, and inline scripts via a content script
- Badge on the extension icon shows how many streams have been detected on the current tab
- Click the icon to see all detected streams — copy the URL or click **Open in LiveCut** to launch it directly

## Permissions

| Permission | Reason |
|---|---|
| `webRequest` | Intercept network requests to detect .m3u8 URLs |
| `clipboardWrite` | Copy stream URL to clipboard |
| `activeTab` | Get current tab info |
| `storage` | (Reserved for future preferences) |
| `<all_urls>` | Monitor requests on any site |

## Limitations

- **Encrypted/DRM streams**: URLs are detected but content may not be accessible in LiveCut
- **Blob URLs**: Content script catches these via fetch/XHR interception but they won't work in LiveCut directly
- **Auth-gated streams**: Will show as detected, but LiveCut will need a proxy workaround
- Does NOT detect RTMP or RTSP (browser never makes those requests)

## For RTMP/RTSP

These protocols can't run in a browser. Use FFmpeg to relay them as HLS:

```bash
# RTMP → HLS
ffmpeg -i rtmp://your-server/live/stream -c copy -f hls -hls_time 2 -hls_list_size 5 /tmp/hls/out.m3u8

# RTSP → HLS  
ffmpeg -rtsp_transport tcp -i rtsp://camera/stream -c copy -f hls -hls_time 2 -hls_list_size 5 /tmp/hls/out.m3u8

# Serve with CORS
npx serve /tmp/hls --cors -l 8080
# → paste http://localhost:8080/out.m3u8 into LiveCut
```

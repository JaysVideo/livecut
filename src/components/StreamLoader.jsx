import React, { useState } from 'react'
import styles from './StreamLoader.module.css'

const SAMPLE = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'

function detectProtocol(url) {
  if (/^rtsps?:\/\//i.test(url)) return 'rtsp'
  if (/^rtmp:\/\//i.test(url)) return 'rtmp'
  return null
}

function buildFFmpegCommand(sourceUrl, proto) {
  if (proto === 'rtsp') {
    return `ffmpeg -rtsp_transport tcp -i "${sourceUrl}" -c copy -f hls -hls_time 2 -hls_list_size 5 -hls_flags delete_segments C:\\hls\\stream.m3u8`
  }
  if (proto === 'rtmp') {
    return `ffmpeg -i "${sourceUrl}" -c copy -f hls -hls_time 2 -hls_list_size 5 -hls_flags delete_segments C:\\hls\\stream.m3u8`
  }
  return ''
}

export function StreamLoader({ onLoad, loaded, error, viaProxy, isLive }) {
  const [url, setUrl] = useState('')
  const [rtspUrl, setRtspUrl] = useState('')
  const [showConverter, setShowConverter] = useState(false)
  const [copied, setCopied] = useState(null)

  const proto = detectProtocol(rtspUrl)
  const ffmpegCmd = proto ? buildFFmpegCommand(rtspUrl, proto) : ''
  const serveCmd = `npx serve C:\\hls --cors -l 8080`
  const hlsResult = 'http://localhost:8080/stream.m3u8'

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    // If they pasted RTSP/RTMP into the main box, redirect to converter
    if (detectProtocol(trimmed)) {
      setRtspUrl(trimmed)
      setUrl('')
      setShowConverter(true)
      return
    }
    onLoad(trimmed)
  }

  async function copyText(text, key) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
    }
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  function useHlsResult() {
    setShowConverter(false)
    onLoad(hlsResult)
  }

  return (
    <div className={styles.loader}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.inputRow}>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Paste .m3u8 URL  (or rtsp:// / rtmp:// to convert)"
            spellCheck={false}
          />
          <button type="submit" className="primary" disabled={!url.trim()}>
            Load
          </button>
          <button type="button" onClick={() => { setUrl(SAMPLE); onLoad(SAMPLE) }}>
            Sample
          </button>
        </div>
      </form>

      <div className={styles.meta}>
        {loaded && (
          <span className={styles.badge} data-type={isLive ? 'live' : 'vod'}>
            {isLive ? '● LIVE' : '◆ VOD'}
          </span>
        )}
        {viaProxy && <span className={styles.badge} data-type="proxy">via proxy</span>}
        {error && <span className={styles.err}>⚠ {error}</span>}
      </div>

      <div className={styles.helpToggle}>
        <button type="button" onClick={() => setShowConverter(h => !h)}>
          {showConverter ? '▲' : '▼'} RTMP / RTSP → HLS converter
        </button>
      </div>

      {showConverter && (
        <div className={styles.help}>
          <p className={styles.helpTitle}>
            Browsers can't play RTMP or RTSP directly. Convert to a local HLS stream with FFmpeg, then paste the result URL above.
          </p>

          <div className={styles.converterStep}>
            <div className={styles.stepLabel}>1 · Paste your feed URL</div>
            <input
              type="text"
              className={styles.rtspInput}
              value={rtspUrl}
              onChange={e => setRtspUrl(e.target.value)}
              placeholder="rtsp://192.168.1.100/stream   or   rtmp://live.server/app/key"
              spellCheck={false}
            />
            {rtspUrl && !proto && (
              <div className={styles.rtspWarn}>⚠ Doesn't look like rtsp:// or rtmp://</div>
            )}
          </div>

          <div className={styles.converterStep}>
            <div className={styles.stepLabel}>2 · Create output folder (run once)</div>
            <div className={styles.cmdRow}>
              <code className={styles.cmdCode}>mkdir C:\hls</code>
              <button className={styles.copyBtn} onClick={() => copyText('mkdir C:\\hls', 'mkdir')} title="Copy">
                {copied === 'mkdir' ? '✓' : '⧉'}
              </button>
            </div>
          </div>

          <div className={styles.converterStep}>
            <div className={styles.stepLabel}>3 · Run FFmpeg</div>
            {ffmpegCmd ? (
              <div className={styles.cmdRow}>
                <code className={styles.cmdCode}>{ffmpegCmd}</code>
                <button className={styles.copyBtn} onClick={() => copyText(ffmpegCmd, 'ffmpeg')} title="Copy">
                  {copied === 'ffmpeg' ? '✓' : '⧉'}
                </button>
              </div>
            ) : (
              <div className={styles.cmdPlaceholder}>Enter your feed URL above to generate this command</div>
            )}
          </div>

          <div className={styles.converterStep}>
            <div className={styles.stepLabel}>4 · Serve with CORS (new Command Prompt window)</div>
            <div className={styles.cmdRow}>
              <code className={styles.cmdCode}>{serveCmd}</code>
              <button className={styles.copyBtn} onClick={() => copyText(serveCmd, 'serve')} title="Copy">
                {copied === 'serve' ? '✓' : '⧉'}
              </button>
            </div>
          </div>

          <div className={styles.converterStep}>
            <div className={styles.stepLabel}>5 · Load in LiveCut</div>
            <div className={styles.cmdRow}>
              <code className={styles.cmdCode}>{hlsResult}</code>
              <button className={styles.copyBtn} onClick={() => copyText(hlsResult, 'hls')} title="Copy">
                {copied === 'hls' ? '✓' : '⧉'}
              </button>
              <button className={styles.useBtn} onClick={useHlsResult}>Use ↑</button>
            </div>
            <div className={styles.rtspNote}>
              Keep both Command Prompt windows open while clipping.&nbsp;
              FFmpeg required — <a href="https://ffmpeg.org/download.html" target="_blank" rel="noreferrer">ffmpeg.org/download</a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import React, { useState } from 'react'
import styles from './StreamLoader.module.css'

const SAMPLE = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'

export function StreamLoader({ onLoad, loaded, error, viaProxy, isLive }) {
  const [url, setUrl] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (url.trim()) onLoad(url.trim())
  }

  return (
    <div className={styles.loader}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.inputRow}>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Paste .m3u8, .m3u stream URL…"
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
        <button type="button" onClick={() => setShowHelp(h => !h)}>
          {showHelp ? '▲' : '▼'} RTMP / RTSP streams
        </button>
      </div>

      {showHelp && (
        <div className={styles.help}>
          <p className={styles.helpTitle}>Browsers can't play RTMP or RTSP directly. Convert to HLS locally with FFmpeg:</p>
          <div className={styles.codeBlock}>
            <span className={styles.comment}># RTMP → HLS</span>
            <code>ffmpeg -i rtmp://your-server/live/stream -c copy -f hls -hls_time 2 -hls_list_size 5 -hls_flags delete_segments /tmp/hls/stream.m3u8</code>
            <span className={styles.comment}># RTSP → HLS</span>
            <code>ffmpeg -rtsp_transport tcp -i rtsp://your-camera/stream -c copy -f hls -hls_time 2 -hls_list_size 5 /tmp/hls/stream.m3u8</code>
            <span className={styles.comment}># Serve with CORS (Node.js)</span>
            <code>npx serve /tmp/hls --cors -l 8080</code>
          </div>
          <p>Then paste <strong>http://localhost:8080/stream.m3u8</strong> above.</p>
          <p style={{marginTop: '8px'}}>Need to find the HLS URL on a page? Use the <strong>LiveCut Stream Sniffer</strong> Chrome extension (included in this repo under <code>/extension</code>).</p>
        </div>
      )}
    </div>
  )
}

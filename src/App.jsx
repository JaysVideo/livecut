import React, { useRef, useState, useCallback, useEffect } from 'react'
import { StreamLoader } from './components/StreamLoader'
import { VideoPlayer } from './components/VideoPlayer'
import { ClipControls } from './components/ClipControls'
import { ClipList } from './components/ClipList'
import { useHls } from './hooks/useHls'
import { useFFmpeg, exportClip, exportCombined } from './hooks/useFFmpeg'
import { downloadBlob } from './utils/time'
import styles from './App.module.css'

let clipIdCounter = 0

export default function App() {
  const videoRef = useRef(null)
  const { loadStream, loaded, error, viaProxy, duration, isLive, getSegmentsForRange, jumpToLive } = useHls(videoRef)
  const { ready, loading } = useFFmpeg()

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('livecut-theme') || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('livecut-theme', theme)
  }, [theme])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const streamUrl = params.get('stream')
    if (streamUrl) {
      loadStream(streamUrl)
      // Clean up URL without reloading page
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const [currentTime, setCurrentTime] = useState(0)
  const [inPoint, setInPoint] = useState(null)
  const [outPoint, setOutPoint] = useState(null)
  const [clips, setClips] = useState([])
  const [exportingId, setExportingId] = useState(null)
  const [exportProgress, setExportProgress] = useState(null)
  const [combinedExporting, setCombinedExporting] = useState(false)
  const [combinedProgress, setCombinedProgress] = useState(null)
  const cancelRef = useRef(false)

  function handleCancelExport() {
    cancelRef.current = true
    setCombinedExporting(false)
    setCombinedProgress(null)
    setExportingId(null)
    setExportProgress(null)
  }

  function handleAddClip({ name, inPoint: ip, outPoint: op }) {
    const segments = getSegmentsForRange(ip, op)
    if (!segments || segments.length === 0) {
      alert('No stream segments found for this range. The stream may need to be loaded.')
      return
    }
    const id = ++clipIdCounter
    setClips(prev => [...prev, { id, name, inPoint: ip, outPoint: op, segments }])
    setInPoint(null)
    setOutPoint(null)
  }

  function handlePreviewCurrent() {
    const v = videoRef.current
    if (!v || inPoint == null || outPoint == null) return
    v.currentTime = inPoint
    v.play()
    const stop = () => {
      if (v.currentTime >= outPoint) {
        v.pause()
        v.removeEventListener('timeupdate', stop)
      }
    }
    v.addEventListener('timeupdate', stop)
  }

  function handlePreviewClip(clip) {
    const v = videoRef.current
    if (!v) return
    v.currentTime = clip.inPoint
    v.play()
    const stop = () => {
      if (v.currentTime >= clip.outPoint) {
        v.pause()
        v.removeEventListener('timeupdate', stop)
      }
    }
    v.addEventListener('timeupdate', stop)
  }

  async function handleExportClip(clip) {
    if (!clip.segments) return
    setExportingId(clip.id)
    setExportProgress(null)
    try {
      const blob = await exportClip(
        clip.segments,
        clip.inPoint,
        clip.outPoint,
        p => setExportProgress(p)
      )
      downloadBlob(blob, `${clip.name.replace(/[^a-z0-9_-]/gi, '_')}.mp4`)
    } catch (err) {
      console.error('Export error:', err)
      alert(`Export failed: ${err?.message || err?.toString() || 'Unknown error — check console'}`)
    } finally {
      setExportingId(null)
      setExportProgress(null)
    }
  }

  async function handleExportCombined() {
    if (clips.length < 2) return
    setCombinedExporting(true)
    setCombinedProgress(null)
    try {
      const blob = await exportCombined(
        clips,
        p => setCombinedProgress(p)
      )
      const timestamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
      downloadBlob(blob, `livecut-combined-${timestamp}.mp4`)
    } catch (err) {
      console.error('Combined export error:', err)
      alert(`Combined export failed: ${err?.message || err?.toString() || 'Unknown error — check console'}`)
    } finally {
      setCombinedExporting(false)
      setCombinedProgress(null)
    }
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>▶</span>
          <span className={styles.logoText}>LIVE<span>CUT</span></span>
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.tagline}>HLS clip tool — browser only, no uploads</span>
          <a
            href="https://github.com/JaysVideo/livecut/raw/main/extension.zip"
            className={styles.extLink}
            title="Download Stream Sniffer Chrome Extension — unzip and load via chrome://extensions"
            download="livecut-sniffer.zip"
          >
            ⬡ Get Sniffer
          </a>
          <button
            className={styles.themeToggle}
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title="Toggle light/dark mode"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.leftCol}>
          <section className={styles.card}>
            <StreamLoader
              onLoad={loadStream}
              loaded={loaded}
              error={error}
              viaProxy={viaProxy}
              isLive={isLive}
            />
          </section>

          <section className={styles.card}>
            <VideoPlayer
              videoRef={videoRef}
              loaded={loaded}
              duration={duration}
              isLive={isLive}
              inPoint={inPoint}
              outPoint={outPoint}
              onTimeUpdate={setCurrentTime}
              onJumpToLive={jumpToLive}
            />
          </section>

          <section className={styles.card}>
            <ClipControls
              videoRef={videoRef}
              loaded={loaded}
              isLive={isLive}
              inPoint={inPoint}
              outPoint={outPoint}
              onSetIn={setInPoint}
              onSetOut={setOutPoint}
              onAddClip={handleAddClip}
              onPreview={handlePreviewCurrent}
              jumpToLive={jumpToLive}
            />
          </section>
        </div>

        <div className={styles.rightCol}>
          <section className={`${styles.card} ${styles.clipListCard}`}>
            <ClipList
              clips={clips}
              onRemove={id => setClips(prev => prev.filter(c => c.id !== id))}
              onRename={(id, name) => setClips(prev => prev.map(c => c.id === id ? { ...c, name } : c))}
              onPreview={handlePreviewClip}
              onExportClip={handleExportClip}
              onExportCombined={handleExportCombined}
              onCancelExport={handleCancelExport}
              exportingId={exportingId}
              exportProgress={exportProgress}
              combinedExporting={combinedExporting}
              combinedProgress={combinedProgress}
            />
          </section>
        </div>
      </main>

      <footer className={styles.footer}>
        <span>livecut.jaysvideo.com</span>
        <span className={styles.footerDivider}>·</span>
        <span>No server. No uploads. Your clips stay in your browser.</span>
      </footer>
    </div>
  )
}

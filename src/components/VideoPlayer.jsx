import React, { useEffect, useRef, useState, useCallback } from 'react'
import { fmtTime } from '../utils/time'
import styles from './VideoPlayer.module.css'

const RW_RATES  = [2, 4, 8]   // rewind speed multipliers
const FF_RATES  = [2, 4, 8]   // fast-forward speed multipliers

export function VideoPlayer({ videoRef, loaded, duration, isLive, inPoint, outPoint, onTimeUpdate, onJumpToLive }) {
  const progressRef   = useRef(null)
  const rewindTimer   = useRef(null)
  const [muted,       setMuted]       = useState(true)
  const [playing,     setPlaying]     = useState(false)
  const [rwIdx,       setRwIdx]       = useState(-1)   // -1 = off, 0/1/2 = speed index
  const [ffIdx,       setFfIdx]       = useState(-1)

  // ── sync play/pause state ───────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTime  = () => onTimeUpdate?.(v.currentTime)
    const onPlay  = () => setPlaying(true)
    const onPause = () => { setPlaying(false) }
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('play',  onPlay)
    v.addEventListener('pause', onPause)
    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('play',  onPlay)
      v.removeEventListener('pause', onPause)
    }
  }, [videoRef, onTimeUpdate])

  // ── rewind ticker (browser doesn't support negative playbackRate) ───────
  const stopRewind = useCallback(() => {
    if (rewindTimer.current) { clearInterval(rewindTimer.current); rewindTimer.current = null }
    setRwIdx(-1)
  }, [])

  const startRewind = useCallback((idx) => {
    const v = videoRef.current
    if (!v) return
    // stop any FF first
    v.playbackRate = 1
    v.pause()
    setFfIdx(-1)
    if (rewindTimer.current) clearInterval(rewindTimer.current)
    setRwIdx(idx)
    const rate = RW_RATES[idx]
    const step = rate * 0.25  // how many seconds to step back per 250ms tick
    rewindTimer.current = setInterval(() => {
      const vid = videoRef.current
      if (!vid) return
      if (vid.currentTime <= 0) { stopRewind(); return }
      vid.currentTime = Math.max(0, vid.currentTime - step)
    }, 250)
  }, [videoRef, stopRewind])

  const stopFF = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.playbackRate = 1
    setFfIdx(-1)
  }, [videoRef])

  const startFF = useCallback((idx) => {
    const v = videoRef.current
    if (!v) return
    stopRewind()
    setFfIdx(idx)
    v.playbackRate = FF_RATES[idx]
    v.play().catch(() => {})
  }, [videoRef, stopRewind])

  // ── cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => () => { if (rewindTimer.current) clearInterval(rewindTimer.current) }, [])

  // ── normal controls ─────────────────────────────────────────────────────
  function seek(e) {
    const v = videoRef.current
    if (!v || !duration) return
    stopRewind(); stopFF()
    const rect = progressRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    v.currentTime = ratio * duration
  }

  function toggleMute() {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (rwIdx >= 0) { stopRewind(); v.play().catch(() => {}); return }
    if (ffIdx >= 0) { stopFF(); return }
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  function skip(secs) {
    const v = videoRef.current
    if (!v) return
    stopRewind(); stopFF()
    v.currentTime = Math.max(0, Math.min(duration || Infinity, v.currentTime + secs))
    if (secs > 0) v.play().catch(() => {})
  }

  function handleRW() {
    if (rwIdx >= 0) {
      const next = (rwIdx + 1) % RW_RATES.length
      startRewind(next)
    } else {
      startRewind(0)
    }
  }

  function handleFF() {
    const v = videoRef.current
    if (!v) return
    if (ffIdx >= 0) {
      const next = (ffIdx + 1) % FF_RATES.length
      startFF(next)
    } else {
      startFF(0)
    }
  }

  const currentTime = videoRef.current?.currentTime || 0
  const pct    = duration ? (currentTime / duration) * 100 : 0
  const inPct  = duration && inPoint  != null ? (inPoint  / duration) * 100 : null
  const outPct = duration && outPoint != null ? (outPoint / duration) * 100 : null

  const rwLabel = rwIdx >= 0 ? `⏪ ${RW_RATES[rwIdx]}×` : '⏪'
  const ffLabel = ffIdx >= 0 ? `⏩ ${FF_RATES[ffIdx]}×` : '⏩'
  const playLabel = rwIdx >= 0 ? '▶ Play' : ffIdx >= 0 ? '⏸ Pause' : playing ? '⏸ Pause' : '▶ Play'

  return (
    <div className={styles.player}>
      <div className={styles.videoWrap}>
        <video ref={videoRef} className={styles.video} playsInline muted />
        {!loaded && (
          <div className={styles.placeholder}>
            <span>NO SIGNAL</span>
          </div>
        )}
      </div>

      {loaded && (
        <>
          <div className={styles.timeline}>
            <div ref={progressRef} className={styles.progress} onClick={seek}>
              <div className={styles.progressFill} style={{ width: `${pct}%` }} />
              {inPct  != null && <div className={styles.inMarker}  style={{ left: `${inPct}%`  }} />}
              {outPct != null && <div className={styles.outMarker} style={{ left: `${outPct}%` }} />}
              {inPct != null && outPct != null && (
                <div className={styles.rangeHighlight} style={{ left: `${inPct}%`, width: `${outPct - inPct}%` }} />
              )}
            </div>
            <div className={styles.times}>
              <span>{fmtTime(currentTime)}</span>
              <span>{isLive ? '● LIVE' : fmtTime(duration)}</span>
            </div>
          </div>

          <div className={styles.controls}>
            {/* Rewind */}
            <button
              onClick={handleRW}
              className={`${styles.ctrlBtn} ${rwIdx >= 0 ? styles.active : ''}`}
              title="Rewind (click to cycle 2×/4×/8×)"
            >{rwLabel}</button>

            {/* Skip back 10s */}
            <button onClick={() => skip(-10)} className={styles.ctrlBtn} title="Back 10 seconds">
              ↩10
            </button>

            {/* Skip back 5s */}
            <button onClick={() => skip(-5)} className={styles.ctrlBtn} title="Back 5 seconds">
              ↩5
            </button>

            {/* Play / Pause */}
            <button onClick={togglePlay} className={styles.ctrlBtn}>
              {playLabel}
            </button>

            {/* Fast forward */}
            <button
              onClick={handleFF}
              className={`${styles.ctrlBtn} ${ffIdx >= 0 ? styles.active : ''}`}
              title="Fast forward (click to cycle 2×/4×/8×)"
            >{ffLabel}</button>

            {/* Mute */}
            <button onClick={toggleMute} className={`${styles.ctrlBtn} ${!muted ? styles.unmuted : ''}`}>
              {muted ? '🔇' : '🔊'}
            </button>

            {isLive && (
              <button onClick={onJumpToLive} className={styles.liveBtn}>
                ● Live
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

import React, { useEffect, useRef, useState } from 'react'
import { fmtTime } from '../utils/time'
import styles from './VideoPlayer.module.css'

export function VideoPlayer({ videoRef, loaded, duration, isLive, inPoint, outPoint, onTimeUpdate, onJumpToLive }) {
  const progressRef = useRef(null)
  const [muted, setMuted] = useState(true)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTime = () => onTimeUpdate?.(v.currentTime)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
    }
  }, [videoRef, onTimeUpdate])

  function seek(e) {
    const v = videoRef.current
    if (!v || !duration) return
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
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  const currentTime = videoRef.current?.currentTime || 0
  const pct = duration ? (currentTime / duration) * 100 : 0
  const inPct = duration && inPoint != null ? (inPoint / duration) * 100 : null
  const outPct = duration && outPoint != null ? (outPoint / duration) * 100 : null

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
              {inPct != null && <div className={styles.inMarker} style={{ left: `${inPct}%` }} />}
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
            <button onClick={togglePlay} className={styles.ctrlBtn}>
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <button onClick={toggleMute} className={`${styles.ctrlBtn} ${!muted ? styles.unmuted : ''}`}>
              {muted ? '🔇 Muted' : '🔊 Audio On'}
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

import React, { useState, useEffect } from 'react'
import { fmtTime, fmtDuration } from '../utils/time'
import styles from './ClipControls.module.css'

const MAX_CLIP_DURATION = 240 // 4 minutes

export function ClipControls({ videoRef, loaded, isLive, inPoint, outPoint, onSetIn, onSetOut, onAddClip, onPreview, jumpToLive }) {
  const [clipName, setClipName] = useState('')
  const [warning, setWarning] = useState(null)

  useEffect(() => {
    function handleKey(e) {
      if (!loaded) return
      if (e.target.tagName === 'INPUT') return
      const v = videoRef.current
      if (!v) return
      if (e.key === 'i' || e.key === 'I') { onSetIn(v.currentTime) }
      if (e.key === 'o' || e.key === 'O') { onSetOut(v.currentTime) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [loaded, onSetIn, onSetOut, videoRef])

  function nudge(point, delta) {
    const v = videoRef.current
    const current = point === 'in' ? inPoint : outPoint
    if (current == null) return
    const next = Math.max(0, current + delta)
    if (point === 'in') onSetIn(next)
    else onSetOut(next)
    if (v) { v.currentTime = next; v.pause() }
  }

  function quickClip(seconds) {
    const v = videoRef.current
    if (!v) return
    const t = v.currentTime
    onSetIn(Math.max(0, t - seconds))
    onSetOut(t)
  }

  function handleAdd() {
    if (inPoint == null || outPoint == null) return
    const dur = outPoint - inPoint
    if (dur <= 0) { setWarning('Out point must be after in point.'); return }
    if (dur > MAX_CLIP_DURATION) {
      setWarning(`Clip is ${fmtDuration(dur)} — exceeds 4-minute browser memory limit. Trim it down.`)
      return
    }
    setWarning(null)
    const name = clipName.trim() || `Clip ${new Date().toLocaleTimeString()}`
    onAddClip({ name, inPoint, outPoint })
    setClipName('')
  }

  const duration = inPoint != null && outPoint != null ? outPoint - inPoint : null
  const canAdd = inPoint != null && outPoint != null && outPoint > inPoint

  return (
    <div className={styles.controls}>
      {/* Mark row */}
      <div className={styles.section}>
        <div className={styles.markRow}>
          <div className={styles.markGroup}>
            <button
              className={styles.markBtn}
              onClick={() => { const v = videoRef.current; if (v) { onSetIn(v.currentTime) } }}
              disabled={!loaded}
            >
              Mark In <kbd>I</kbd>
            </button>
            <div className={styles.nudgeRow}>
              {[-1, -0.1, +0.1, +1].map(d => (
                <button key={d} onClick={() => nudge('in', d)} disabled={inPoint == null}>
                  {d > 0 ? '+' : ''}{d}s
                </button>
              ))}
            </div>
            <div className={styles.pointTime} data-set={inPoint != null}>
              IN: {fmtTime(inPoint ?? 0)}
            </div>
          </div>

          <div className={styles.markGroup}>
            <button
              className={styles.markBtn}
              onClick={() => { const v = videoRef.current; if (v) { onSetOut(v.currentTime) } }}
              disabled={!loaded}
            >
              Mark Out <kbd>O</kbd>
            </button>
            <div className={styles.nudgeRow}>
              {[-1, -0.1, +0.1, +1].map(d => (
                <button key={d} onClick={() => nudge('out', d)} disabled={outPoint == null}>
                  {d > 0 ? '+' : ''}{d}s
                </button>
              ))}
            </div>
            <div className={styles.pointTime} data-set={outPoint != null}>
              OUT: {fmtTime(outPoint ?? 0)}
            </div>
          </div>
        </div>

        {duration != null && duration > 0 && (
          <div className={styles.duration}>
            Duration: <strong>{fmtDuration(duration)}</strong>
            {duration > MAX_CLIP_DURATION && <span className={styles.warn}> ⚠ OVER LIMIT</span>}
          </div>
        )}
      </div>

      {/* Quick clip + live */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Quick Clip</div>
        <div className={styles.quickRow}>
          {[3, 5, 10].map(s => (
            <button key={s} onClick={() => quickClip(s)} disabled={!loaded}>
              −{s}s
            </button>
          ))}
          {isLive && (
            <button onClick={jumpToLive} disabled={!loaded} className={styles.liveBtn}>
              ● Live
            </button>
          )}
        </div>
      </div>

      {/* Name + add */}
      <div className={styles.section}>
        <div className={styles.addRow}>
          <input
            type="text"
            value={clipName}
            onChange={e => setClipName(e.target.value)}
            placeholder="Clip name…"
            onKeyDown={e => e.key === 'Enter' && canAdd && handleAdd()}
            disabled={!loaded}
          />
          <button onClick={onPreview} disabled={inPoint == null || outPoint == null || outPoint <= inPoint}>
            Preview
          </button>
          <button className="primary" onClick={handleAdd} disabled={!canAdd}>
            + Add
          </button>
        </div>
        {warning && <div className={styles.warning}>⚠ {warning}</div>}
      </div>
    </div>
  )
}

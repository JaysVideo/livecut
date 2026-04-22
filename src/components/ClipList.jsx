import React, { useState } from 'react'
import { fmtDuration, downloadBlob } from '../utils/time'
import styles from './ClipList.module.css'

export function ClipList({ clips, onRemove, onRename, onPreview, onExportClip, onExportCombined, onCancelExport, exportingId, exportProgress, combinedExporting, combinedProgress }) {
  const [editingId, setEditingId] = useState(null)
  const [editVal, setEditVal] = useState('')

  function startRename(clip) {
    setEditingId(clip.id)
    setEditVal(clip.name)
  }

  function commitRename(id) {
    if (editVal.trim()) onRename(id, editVal.trim())
    setEditingId(null)
  }

  function progressLabel(prog) {
    if (!prog) return 'Exporting…'
    if (prog.phase === 'download') {
      if (prog.clip) return `Clip ${prog.clip}/${prog.totalClips} — downloading ${prog.seg}/${prog.totalSegs}…`
      return `Downloading ${prog.current}/${prog.total} segments…`
    }
    if (prog.phase === 'encode') return 'Encoding…'
    return 'Processing…'
  }

  if (clips.length === 0) {
    return (
      <div className={styles.empty}>
        <span>No clips yet — mark in/out and click Add</span>
      </div>
    )
  }

  return (
    <div className={styles.list}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>Saved Clips ({clips.length})</span>
        {clips.length > 1 && (
          <div className={styles.combineRow}>
            <button
              className={`${styles.combineBtn} accent2`}
              onClick={onExportCombined}
              disabled={combinedExporting || clips.some(c => !c.segments)}
            >
              {combinedExporting
                ? progressLabel(combinedProgress)
                : `⬡ Export All Combined (${clips.length} clips)`}
            </button>
            {combinedExporting && (
              <button className="danger" onClick={onCancelExport} style={{fontSize:'11px',padding:'4px 10px'}}>
                ✕ Cancel
              </button>
            )}
          </div>
        )}
      </div>

      {clips.map((clip, idx) => {
        const isExporting = exportingId === clip.id
        const progress = isExporting ? exportProgress : null
        const dur = clip.outPoint - clip.inPoint

        return (
          <div key={clip.id} className={styles.clip} data-exporting={isExporting}>
            <div className={styles.clipNum}>{String(idx + 1).padStart(2, '0')}</div>

            <div className={styles.clipInfo}>
              {editingId === clip.id ? (
                <input
                  className={styles.renameInput}
                  value={editVal}
                  autoFocus
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={() => commitRename(clip.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename(clip.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              ) : (
                <span className={styles.clipName} onClick={() => startRename(clip)} title="Click to rename">
                  {clip.name}
                </span>
              )}
              <span className={styles.clipMeta}>{fmtDuration(dur)}</span>
            </div>

            <div className={styles.clipActions}>
              <button onClick={() => onPreview(clip)} disabled={isExporting || combinedExporting}>
                Preview
              </button>
              {isExporting ? (
                <>
                  <span className={styles.exportingLabel}>{progressLabel(progress)}</span>
                  <button className="danger" onClick={onCancelExport} style={{fontSize:'11px',padding:'4px 10px'}}>
                    ✕
                  </button>
                </>
              ) : (
                <button
                  className="success"
                  onClick={() => onExportClip(clip)}
                  disabled={!clip.segments || combinedExporting}
                >
                  Export MP4
                </button>
              )}
              <button
                className="danger"
                onClick={() => onRemove(clip.id)}
                disabled={isExporting || combinedExporting}
              >
                ✕
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

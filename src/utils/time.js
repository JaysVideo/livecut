export function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return '--:--:--.0'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = (sec % 60).toFixed(1).padStart(4, '0')
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${s}`
}

export function fmtDuration(sec) {
  if (!isFinite(sec) || sec < 0) return '0s'
  if (sec < 60) return `${sec.toFixed(1)}s`
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(0)
  return `${m}m ${s}s`
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

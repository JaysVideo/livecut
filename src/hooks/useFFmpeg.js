import { useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

let ffInstance = null
let ffLoading = false
let ffReady = false

async function getFFmpeg() {
  if (ffReady && ffInstance) return ffInstance
  if (ffLoading) {
    while (ffLoading) await new Promise(r => setTimeout(r, 50))
    return ffInstance
  }
  ffLoading = true
  const ff = new FFmpeg()
  ff.on('log', ({ message }) => console.log('[ffmpeg]', message))
  const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm'
  await ff.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  })
  ffInstance = ff
  ffReady = true
  ffLoading = false
  return ff
}

async function fetchBytes(url) {
  const resp = await fetch(url)
  const buf = await resp.arrayBuffer()
  return new Uint8Array(buf)
}

const initSegmentCache = {}

async function getInitData(initUrl, baseUrl) {
  if (initUrl) {
    if (!initSegmentCache[initUrl]) {
      const data = await fetchBytes(initUrl)
      initSegmentCache[initUrl] = data
      console.log(`[livecut] fetched init: ${data.length} bytes from ${initUrl}`)
    }
    return initSegmentCache[initUrl]
  }

  // Auto-probe
  const candidates = ['init.hls.fmp4', 'init-0.mp4', 'init.mp4', 'init.m4s', 'init-0.m4s']
  for (const c of candidates) {
    const url = baseUrl + c
    if (initSegmentCache[url] !== undefined) {
      return initSegmentCache[url] || null
    }
    try {
      const resp = await fetch(url)
      if (resp.ok) {
        const data = new Uint8Array(await resp.arrayBuffer())
        initSegmentCache[url] = data
        console.log(`[livecut] auto-found init at ${url}: ${data.length} bytes`)
        return data
      }
      initSegmentCache[url] = null
    } catch { initSegmentCache[url] = null }
  }
  return null
}

function isFmp4Url(url) {
  return url?.includes('.mp4') || url?.includes('.m4s') || url?.includes('fmp4')
}

function detectFmp4(segments) {
  return isFmp4Url(segments[0]?.url || '')
}

// Write fMP4 segments to ffmpeg FS, each with init prepended
async function writeFmp4Segments(ff, segments, initData, prefix) {
  const files = []
  for (let i = 0; i < segments.length; i++) {
    const segData = await fetchBytes(segments[i].url)
    const fname = `${prefix}_${i}.mp4`
    if (initData) {
      const combined = new Uint8Array(initData.length + segData.length)
      combined.set(initData, 0)
      combined.set(segData, initData.length)
      await ff.writeFile(fname, combined)
    } else {
      await ff.writeFile(fname, segData)
    }
    files.push(fname)
  }
  return files
}

// Write TS segments to ffmpeg FS
async function writeTsSegments(ff, segments, prefix) {
  const files = []
  for (let i = 0; i < segments.length; i++) {
    const segData = await fetchBytes(segments[i].url)
    const fname = `${prefix}_${i}.ts`
    await ff.writeFile(fname, segData)
    files.push(fname)
  }
  return files
}

async function buildInputFile(ff, segments, initUrl, prefix) {
  const firstUrl = segments[0]?.url || ''
  const isFmp4 = isFmp4Url(firstUrl)
  const baseUrl = firstUrl.substring(0, firstUrl.lastIndexOf('/') + 1)

  if (isFmp4) {
    const initData = await getInitData(initUrl, baseUrl)
    const segFiles = await writeFmp4Segments(ff, segments, initData, prefix)

    if (segFiles.length === 1) return { inputFile: segFiles[0], concatFile: null, segFiles, isFmp4: true }

    const concatFile = `${prefix}_concat.txt`
    await ff.writeFile(concatFile, new TextEncoder().encode(segFiles.map(f => `file ${f}`).join('\n')))
    return { inputFile: null, concatFile, segFiles, isFmp4: true }
  } else {
    const segFiles = await writeTsSegments(ff, segments, prefix)
    const concatFile = `${prefix}_concat.txt`
    await ff.writeFile(concatFile, new TextEncoder().encode(segFiles.map(f => `file ${f}`).join('\n')))
    return { inputFile: null, concatFile, segFiles, isFmp4: false }
  }
}

async function cleanup(ff, files) {
  for (const f of files) await ff.deleteFile(f).catch(() => {})
}

export async function exportClip(segments, inTime, outTime, onProgress) {
  const ff = await getFFmpeg()
  const trimStart = Math.max(0, inTime - segments[0].start)
  const clipDuration = outTime - inTime

  onProgress?.({ phase: 'download', current: 0, total: segments.length })

  // Get video input
  const seg0 = segments[0]
  const { inputFile, concatFile, segFiles, isFmp4 } = await buildInputFile(
    ff, segments, seg0.initSegmentUrl, 'vseg',
  )
  console.log(`[livecut] video: ${segFiles.length} segments, fmp4=${isFmp4}`)

  // Check for separate audio track
  const audioFrags = seg0.audioFrags
  const hasAudio = audioFrags?.length > 0

  let audioInputFile = null
  let audioConcatFile = null
  let audioSegFiles = []

  if (hasAudio) {
    console.log(`[livecut] separate audio track: ${audioFrags.length} fragments`)
    onProgress?.({ phase: 'download', current: segments.length, total: segments.length + audioFrags.length })
    const audioResult = await buildInputFile(ff, audioFrags, seg0.audioInitSegmentUrl, 'aseg')
    audioInputFile = audioResult.inputFile
    audioConcatFile = audioResult.concatFile
    audioSegFiles = audioResult.segFiles
  }

  onProgress?.({ phase: 'encode' })

  const videoArg = inputFile
    ? ['-ss', String(trimStart), '-i', inputFile]
    : ['-ss', String(trimStart), '-f', 'concat', '-safe', '0', '-i', concatFile]
  const audioArg = hasAudio
    ? (audioInputFile
        ? ['-ss', String(trimStart), '-i', audioInputFile]
        : ['-ss', String(trimStart), '-f', 'concat', '-safe', '0', '-i', audioConcatFile])
    : []
  const mapArgs = hasAudio ? ['-map', '0:v:0', '-map', '1:a:0'] : []

  await ff.exec([
    ...videoArg,
    ...audioArg,
    '-t', String(clipDuration),
    ...mapArgs,
    '-c', 'copy',
    '-avoid_negative_ts', 'make_zero',
    '-movflags', '+faststart',
    'output.mp4'
  ])

  const data = await ff.readFile('output.mp4')
  await cleanup(ff, [...segFiles, ...audioSegFiles])
  if (concatFile) await ff.deleteFile(concatFile).catch(() => {})
  if (audioConcatFile) await ff.deleteFile(audioConcatFile).catch(() => {})
  await ff.deleteFile('output.mp4').catch(() => {})

  return new Blob([data.buffer], { type: 'video/mp4' })
}

export async function exportCombined(clips, onProgress) {
  const ff = await getFFmpeg()
  const partFiles = []
  const allFmp4 = clips.every(c => detectFmp4(c.segments))
  const allTs = clips.every(c => !detectFmp4(c.segments))

  for (let ci = 0; ci < clips.length; ci++) {
    const { segments, inPoint, outPoint } = clips[ci]
    const trimStart = Math.max(0, inPoint - segments[0].start)
    const clipDuration = outPoint - inPoint
    const partFile = `part_${ci}.mp4`
    const seg0 = segments[0]
    const isFmp4 = detectFmp4(segments)

    onProgress?.({ phase: 'download', clip: ci + 1, totalClips: clips.length, seg: 0, totalSegs: segments.length })

    const { inputFile, concatFile, segFiles } = await buildInputFile(ff, segments, seg0.initSegmentUrl, `v${ci}`)

    const audioFrags = seg0.audioFrags
    const hasAudio = audioFrags?.length > 0
    let audioInputFile = null, audioConcatFile = null, audioSegFiles = []

    if (hasAudio) {
      const ar = await buildInputFile(ff, audioFrags, seg0.audioInitSegmentUrl, `a${ci}`)
      audioInputFile = ar.inputFile
      audioConcatFile = ar.concatFile
      audioSegFiles = ar.segFiles
    }

    onProgress?.({ phase: 'encode' })

    const mapArgs = hasAudio ? ['-map', '0:v:0', '-map', '1:a:0'] : []

    if (!isFmp4 && !hasAudio) {
      const videoArg = inputFile
        ? ['-ss', String(trimStart), '-i', inputFile]
        : ['-ss', String(trimStart), '-f', 'concat', '-safe', '0', '-i', concatFile]
      await ff.exec([
        ...videoArg,
        '-t', String(clipDuration),
        '-map', '0:v:0', '-map', '0:a:0',
        '-vf', 'scale=-2:720',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-b:v', '3500k', '-maxrate', '4000k', '-bufsize', '8000k',
        '-c:a', 'aac', '-b:a', '128k',
        '-avoid_negative_ts', 'make_zero',
        '-movflags', '+faststart',
        partFile
      ])
    } else if (isFmp4) {
      const videoInput = inputFile || concatFile
      const videoFmt = inputFile ? [] : ['-f', 'concat', '-safe', '0']
      const seg0Start = segments[0].start || 0
      const itsoffset = -seg0Start

      if (hasAudio) {
        const audioInput = audioInputFile || audioConcatFile
        const audioFmt = audioInputFile ? [] : ['-f', 'concat', '-safe', '0']
        const audioSeg0Start = audioFrags?.[0]?.start || seg0Start
        await ff.exec([
          '-itsoffset', String(-seg0Start),
          ...videoFmt, '-i', videoInput,
          '-itsoffset', String(-audioSeg0Start),
          ...audioFmt, '-i', audioInput,
          '-ss', String(trimStart),
          '-t', String(clipDuration),
          '-map', '0:v:0', '-map', '1:a:0',
          '-vf', 'scale=-2:720',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-b:v', '3500k', '-maxrate', '4000k', '-bufsize', '8000k',
          '-c:a', 'aac', '-b:a', '128k',
          '-avoid_negative_ts', 'make_zero',
          '-fps_mode', 'cfr',
          partFile
        ])
      } else {
        await ff.exec([
          '-itsoffset', String(itsoffset),
          ...videoFmt, '-i', videoInput,
          '-ss', String(trimStart),
          '-t', String(clipDuration),
          '-map', '0:v:0', '-map', '0:a:0?',
          '-vf', 'scale=-2:720',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-b:v', '3500k', '-maxrate', '4000k', '-bufsize', '8000k',
          '-c:a', 'aac', '-b:a', '128k',
          '-avoid_negative_ts', 'make_zero',
          '-fps_mode', 'cfr',
          partFile
        ])
      }
    } else {
      // TS with separate audio
      const videoArg = inputFile
        ? ['-ss', String(trimStart), '-i', inputFile]
        : ['-ss', String(trimStart), '-f', 'concat', '-safe', '0', '-i', concatFile]
      const audioArg = hasAudio
        ? (audioInputFile
            ? ['-ss', String(trimStart), '-i', audioInputFile]
            : ['-ss', String(trimStart), '-f', 'concat', '-safe', '0', '-i', audioConcatFile])
        : []
      await ff.exec([
        ...videoArg,
        ...audioArg,
        '-t', String(clipDuration),
        ...mapArgs,
        '-vf', 'scale=-2:720',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-b:v', '3500k', '-maxrate', '4000k', '-bufsize', '8000k',
        '-c:a', 'aac', '-b:a', '128k',
        '-avoid_negative_ts', 'make_zero',
        '-fps_mode', 'cfr',
        partFile
      ])
    }

    try {
      const check = await ff.readFile(partFile)
      console.log(`[livecut] part_${ci}.mp4: ${check.length} bytes`)
      partFiles.push(partFile)
    } catch (e) {
      throw new Error(`Clip ${ci + 1} failed to export — check console`)
    }

    await cleanup(ff, [...segFiles, ...audioSegFiles])
    if (concatFile) await ff.deleteFile(concatFile).catch(() => {})
    if (audioConcatFile) await ff.deleteFile(audioConcatFile).catch(() => {})
  }

  onProgress?.({ phase: 'encode' })

  await ff.writeFile('final_concat.txt', new TextEncoder().encode(partFiles.map(f => `file ${f}`).join('\n')))

  if (allTs) {
    // All TS stream-copied parts — final concat is also stream copy, instant
    await ff.exec([
      '-f', 'concat', '-safe', '0', '-i', 'final_concat.txt',
      '-c', 'copy',
      '-movflags', '+faststart',
      'combined.mp4'
    ])
  } else {
    // fMP4 or mixed — re-encode final with ultrafast
    await ff.exec([
      '-f', 'concat', '-safe', '0', '-i', 'final_concat.txt',
      '-map', '0:v:0', '-map', '0:a:0',
      '-vf', 'scale=-2:720',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-b:v', '3500k', '-maxrate', '4000k', '-bufsize', '8000k',
      '-c:a', 'aac', '-b:a', '128k',
      '-fps_mode', 'cfr', '-movflags', '+faststart',
      'combined.mp4'
    ])
  }

  const data = await ff.readFile('combined.mp4')
  await cleanup(ff, partFiles)
  await ff.deleteFile('final_concat.txt').catch(() => {})
  await ff.deleteFile('combined.mp4').catch(() => {})

  return new Blob([data.buffer], { type: 'video/mp4' })
}

export function useFFmpeg() {
  const [, forceUpdate] = useState(0)
  return { ready: ffReady, loading: ffLoading, exportClip, exportCombined }
}

import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

const PROXY_URL = import.meta.env.VITE_PROXY_URL || 'https://corsproxy.io/?'

function proxyUrl(url) {
  // Don't double-proxy
  if (url.includes(PROXY_URL) || url.startsWith(new URL(PROXY_URL).origin)) return url
  return PROXY_URL + encodeURIComponent(url)
}

function isAlreadyProxied(url) {
  try {
    return url.startsWith(new URL(PROXY_URL).origin)
  } catch {
    return false
  }
}

export function useHls(videoRef) {
  const hlsRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [viaProxy, setViaProxy] = useState(false)
  const [duration, setDuration] = useState(0)
  const [isLive, setIsLive] = useState(false)

  function loadStream(url) {
    setLoaded(false)
    setError(null)
    setViaProxy(false)

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (!url) return

    // If we're on HTTPS and the stream is HTTP, proxy it immediately
    // to avoid mixed content block — no point trying direct
    const needsProxy = window.location.protocol === 'https:' && url.startsWith('http:') && !isAlreadyProxied(url)
    const initialUrl = needsProxy ? proxyUrl(url) : url

    tryLoad(initialUrl, needsProxy)

    function tryLoad(streamUrl, isProxy) {
      if (!Hls.isSupported()) {
        // Fallback for Safari native HLS
        const v = videoRef.current
        if (v && v.canPlayType('application/vnd.apple.mpegurl')) {
          v.src = streamUrl
          v.addEventListener('loadedmetadata', () => {
            setLoaded(true)
            setDuration(v.duration || 0)
            setIsLive(!isFinite(v.duration))
          }, { once: true })
          v.addEventListener('error', () => setError('Stream failed to load.'), { once: true })
        }
        return
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 120,
        xhrSetup: isProxy ? (xhr, url) => {
          // If sub-request URL is HTTP on HTTPS page or not already proxied, proxy it
          if ((window.location.protocol === 'https:' && url.startsWith('http:')) && !isAlreadyProxied(url)) {
            const proxied = proxyUrl(url)
            xhr.open('GET', proxied, true)
          }
        } : undefined,
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (!isProxy) {
            hls.destroy()
            tryLoad(proxyUrl(url), true)
          } else {
            setError(
              data.response?.code === 403
                ? 'Stream returned 403 — authentication required or stream is private.'
                : 'Failed to load stream. Check the URL and try again.'
            )
          }
        }
      })

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoaded(true)
        setViaProxy(isProxy)
        const v = videoRef.current
        if (v) {
          v.muted = true
          v.play().catch(() => {})
        }
      })

      hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
        setIsLive(data.details.live)
        if (!data.details.live) {
          setDuration(data.details.totalduration)
        }

        // Diagnostic logging — helps debug segment format for new stream types
        const details = data.details
        const firstFrag = details.fragments?.[0]
        const initSeg = details.initSegment
        console.log('[livecut] Level loaded:', {
          live: details.live,
          duration: details.totalduration,
          fragmentCount: details.fragments?.length,
          firstFragUrl: firstFrag?.url,
          initSegmentUrl: initSeg?.url || null,
          fragmentType: firstFrag?.url?.includes('.mp4') || firstFrag?.url?.includes('.m4s') || firstFrag?.url?.includes('fmp4') ? 'fMP4' : 'MPEG-TS',
        })
      })

      hls.loadSource(streamUrl)
      hls.attachMedia(videoRef.current)
      hlsRef.current = hls
    }

    // tryLoad is now called above with the correct initial URL
  }

  function getSegmentsForRange(inTime, outTime) {
    const hls = hlsRef.current
    if (!hls || !hls.levels || hls.levels.length === 0) return null
    const level = hls.levels[hls.currentLevel >= 0 ? hls.currentLevel : 0]
    if (!level?.details?.fragments) return null

    // Filter fragments for the requested time range
    const frags = level.details.fragments.filter(f => {
      const fEnd = f.start + f.duration
      return fEnd > inTime && f.start < outTime
    })

    // Get init segment URL if this is an fMP4 stream
    let initSegmentUrl = level.details.initSegment?.url || null

    // Fallback: check if HLS.js stores init on the fragment itself
    if (!initSegmentUrl && frags.length > 0) {
      const firstUrl = frags[0]?.url || ''
      const isFmp4 = firstUrl.includes('.mp4') || firstUrl.includes('.m4s') || firstUrl.includes('fmp4')
      if (isFmp4) {
        const hlsInit = level.details?.fragments?.[0]?.initSegment?.url
        if (hlsInit) {
          initSegmentUrl = hlsInit
          console.log('[livecut] Found init segment via fragment.initSegment:', initSegmentUrl)
        } else {
          console.log('[livecut] fMP4 stream, no init segment found. Base URL:', firstUrl.substring(0, firstUrl.lastIndexOf('/') + 1))
        }
      }
    }

    // Also get audio track fragments if this is a multi-track fMP4 stream
    // HLS.js stores audio tracks in hls.audioTracks
    let audioFrags = null
    let audioInitSegmentUrl = null
    const isFmp4Stream = frags.length > 0 && (frags[0]?.url?.includes('fmp4') || frags[0]?.url?.includes('.m4s'))
    if (isFmp4Stream && hls.audioTracks?.length > 0) {
      const audioTrack = hls.audioTracks[hls.audioTrack >= 0 ? hls.audioTrack : 0]
      if (audioTrack?.details?.fragments) {
        audioFrags = audioTrack.details.fragments.filter(f => {
          const fEnd = f.start + f.duration
          return fEnd > inTime && f.start < outTime
        }).map(f => ({
          ...f,
          url: f.url || (f.baseurl && f.relurl ? f.baseurl + f.relurl : null),
        })).filter(f => !!f.url)
        audioInitSegmentUrl = audioTrack.details.initSegment?.url ||
          audioTrack.details?.fragments?.[0]?.initSegment?.url || null
        if (audioFrags.length > 0) {
          console.log('[livecut] Found separate audio track:', audioFrags.length, 'fragments, init:', audioInitSegmentUrl)
        }
      }
    }

    return frags.map(f => ({
      ...f,
      url: f.url || (f.baseurl && f.relurl ? f.baseurl + f.relurl : null),
      initSegmentUrl,
      audioFrags: audioFrags || null,
      audioInitSegmentUrl: audioInitSegmentUrl || null,
    })).filter(f => {
      if (!f.url) console.warn('[livecut] fragment missing URL:', f)
      return !!f.url
    })
  }

  function jumpToLive() {
    const v = videoRef.current
    if (!v) return
    if (isLive) {
      const hls = hlsRef.current
      if (hls) {
        const level = hls.levels[hls.currentLevel >= 0 ? hls.currentLevel : 0]
        if (level?.details?.fragments?.length) {
          const frags = level.details.fragments
          const liveEdge = frags[frags.length - 1].start + frags[frags.length - 1].duration - 5
          v.currentTime = Math.max(0, liveEdge)
        }
      }
    }
    v.play().catch(() => {})
  }

  useEffect(() => {
    return () => { if (hlsRef.current) hlsRef.current.destroy() }
  }, [])

  return { loadStream, loaded, error, viaProxy, duration, isLive, getSegmentsForRange, jumpToLive, hlsRef }
}

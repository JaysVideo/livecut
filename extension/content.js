// content.js — LiveCut Stream Sniffer
// Watches page source, inline scripts, video elements, and XHR/fetch calls
// for HLS stream URLs that the webRequest API might miss (e.g. blob URLs, injected scripts)

(function () {
  const found = new Set()

  function report(url) {
    if (found.has(url)) return
    found.add(url)
    chrome.runtime.sendMessage({ type: 'CONTENT_STREAM', url }).catch(() => {})
  }

  function checkUrl(url) {
    if (!url || typeof url !== 'string') return
    try {
      const u = new URL(url, location.href)
      const path = u.pathname.toLowerCase()
      if (path.endsWith('.m3u8') || path.endsWith('.m3u')) report(u.href)
    } catch {}
  }

  // Watch video/source elements
  function scanDOM() {
    document.querySelectorAll('video, source').forEach(el => {
      checkUrl(el.src || el.getAttribute('src'))
    })
    // Look for .m3u8 in all script tags (common in page source)
    document.querySelectorAll('script:not([src])').forEach(el => {
      const matches = el.textContent.matchAll(/https?:\/\/[^\s"'`]+\.m3u8[^\s"'`]*/g)
      for (const m of matches) checkUrl(m[0])
    })
  }

  // Intercept fetch
  const origFetch = window.fetch
  window.fetch = function (input, ...args) {
    const url = typeof input === 'string' ? input : input?.url
    checkUrl(url)
    return origFetch.apply(this, [input, ...args])
  }

  // Intercept XHR
  const origOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    checkUrl(url)
    return origOpen.apply(this, [method, url, ...rest])
  }

  // Watch for dynamically added video elements
  const observer = new MutationObserver(() => scanDOM())
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })

  // Initial scan
  if (document.readyState !== 'loading') scanDOM()
  else document.addEventListener('DOMContentLoaded', scanDOM)
})()

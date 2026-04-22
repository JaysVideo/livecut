// background.js — LiveCut Stream Sniffer
// Intercepts all network requests and records any .m3u8 URLs found

const LIVECUT_URL = 'https://livecut.jaysvideo.com/'

// Map: tabId -> Set of detected stream URLs
const tabStreams = {}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = details.url
    if (isStreamUrl(url)) {
      const tabId = details.tabId
      if (tabId < 0) return
      if (!tabStreams[tabId]) tabStreams[tabId] = new Set()
      tabStreams[tabId].add(url)

      // Update badge count
      const count = tabStreams[tabId].size
      chrome.action.setBadgeText({ text: String(count), tabId })
      chrome.action.setBadgeBackgroundColor({ color: '#e8ff47', tabId })
    }
  },
  { urls: ['<all_urls>'] }
)

// Clean up when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabStreams[tabId]
})

// Clean up when tab navigates
// Also detect when a tab navigates directly to an .m3u8 URL
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    // Check if navigating TO a stream URL
    if (tab.url && isStreamUrl(tab.url)) {
      if (!tabStreams[tabId]) tabStreams[tabId] = new Set()
      tabStreams[tabId].add(tab.url)
      chrome.action.setBadgeText({ text: '1', tabId })
      chrome.action.setBadgeBackgroundColor({ color: '#e8ff47', tabId })
    } else {
      // Navigating away — clear previous streams
      delete tabStreams[tabId]
      chrome.action.setBadgeText({ text: '', tabId })
    }
  }
})

// Message handler from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_ALL_STREAMS') {
    const result = []
    for (const [tabId, urlSet] of Object.entries(tabStreams)) {
      chrome.tabs.get(parseInt(tabId), (tab) => {}) // fire and forget
      for (const url of urlSet) {
        result.push({ url, tabId: parseInt(tabId) })
      }
    }
    sendResponse({ streams: result })
  }

  if (msg.type === 'GET_STREAMS') {
    const tabId = msg.tabId
    const streams = tabStreams[tabId] ? Array.from(tabStreams[tabId]) : []
    sendResponse({ streams })
  }
  if (msg.type === 'CLEAR_STREAMS') {
    const tabId = msg.tabId
    delete tabStreams[tabId]
    chrome.action.setBadgeText({ text: '', tabId })
    sendResponse({ ok: true })
  }
  if (msg.type === 'CONTENT_STREAM') {
    const tabId = sender.tab?.id
    if (tabId && tabId >= 0) {
      if (!tabStreams[tabId]) tabStreams[tabId] = new Set()
      tabStreams[tabId].add(msg.url)
      const count = tabStreams[tabId].size
      chrome.action.setBadgeText({ text: String(count), tabId })
      chrome.action.setBadgeBackgroundColor({ color: '#e8ff47', tabId })
    }
    sendResponse({ ok: true })
  }
  if (msg.type === 'OPEN_LIVECUT') {
    const url = LIVECUT_URL + '?stream=' + encodeURIComponent(msg.streamUrl)
    chrome.tabs.create({ url })
  }
  return true
})

function isStreamUrl(url) {
  try {
    const u = new URL(url)
    const path = u.pathname.toLowerCase()
    // Match .m3u8, .m3u
    if (path.endsWith('.m3u8') || path.endsWith('.m3u')) return true
    // Match common HLS patterns in query strings or paths
    if (path.includes('/hls/') && path.includes('.ts')) return false // skip segments
    if (u.searchParams.has('format') && u.searchParams.get('format').includes('m3u')) return true
    return false
  } catch {
    return false
  }
}

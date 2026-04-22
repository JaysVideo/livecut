const LIVECUT_URL = 'https://livecut.jaysvideo.com/'

async function refresh() {
  const allTabs = await chrome.tabs.query({})
  const allStreams = []
  const seenUrls = new Set()

  for (const t of allTabs) {
    if (t.url && (t.url.includes('.m3u8') || t.url.includes('.m3u'))) {
      if (!seenUrls.has(t.url)) {
        seenUrls.add(t.url)
        allStreams.push({ url: t.url, tabTitle: t.title || t.url })
      }
    }
  }

  // Also get sniffed streams from background (XHR/fetch intercepted)
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_ALL_STREAMS' })
    const sniffed = resp?.streams || []
    for (const { url, tabTitle } of sniffed) {
      if (!seenUrls.has(url)) {
        seenUrls.add(url)
        allStreams.push({ url, tabTitle: tabTitle || url })
      }
    }
  } catch (e) {}

  const streams = allStreams
  const badge = document.getElementById('count-badge')
  badge.textContent = `${streams.length} stream${streams.length !== 1 ? 's' : ''}`

  const list = document.getElementById('stream-list')

  if (streams.length === 0) {
    list.innerHTML = `<div class="empty">
      <strong>No streams detected</strong>
      Navigate to a page that plays HLS video.<br>
      Streams will appear here automatically.
    </div>`
    return
  }

  list.innerHTML = streams.map((s, i) => `
    <div class="stream">
      <div class="stream-tab">${escapeHtml(s.tabTitle)}</div>
      <div class="stream-url">${escapeHtml(s.url)}</div>
      <div class="stream-actions">
        <button class="btn-copy" data-url="${escapeAttr(s.url)}" data-idx="${i}">Copy URL</button>
        <button class="btn-open" data-url="${escapeAttr(s.url)}">Open in LiveCut ↗</button>
      </div>
    </div>
  `).join('')

  list.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(btn.dataset.url)
      btn.textContent = 'Copied ✓'
      btn.classList.add('copied')
      setTimeout(() => {
        btn.textContent = 'Copy URL'
        btn.classList.remove('copied')
      }, 1500)
    })
  })

  list.querySelectorAll('.btn-open').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = LIVECUT_URL + '?stream=' + encodeURIComponent(btn.dataset.url)
      chrome.tabs.create({ url })
    })
  })
}

document.getElementById('btn-clear').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab) chrome.runtime.sendMessage({ type: 'CLEAR_STREAMS', tabId: tab.id })
    setTimeout(refresh, 100)
  })
})

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeAttr(s) {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

document.addEventListener('DOMContentLoaded', () => {
  refresh()
  setInterval(refresh, 1500)
})

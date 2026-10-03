// ============================================================================
// Bookmark Library — the real app. Everything below runs only in this
// browser: parsing, storage (IndexedDB), search/filter/triage, export.
// No server, no network calls other than the optional Google Sign-In button.
// ============================================================================

let currentAccount = null;
let bookmarks = [];
let filters = { status: new Set(), folder: new Set(), type: new Set(), freshness: new Set(), presence: new Set(), topic: new Set() };
let analysisCancelled = false;
let analysisRunning = false;
let searchQuery = '';
let sortKey = 'saved-desc';
let selection = new Set();
let suggestedMode = false;
let preSuggestState = null;
let lastBulkSnapshot = null;

const STATUS_LABELS = { 'unreviewed': 'Unreviewed', 'keep': 'Keep', 'read-later': 'Read later', 'delete-candidate': 'Delete candidate' };
const FRESHNESS_LABELS = { new: 'Saved this month', 'this-year': 'Saved this year', 'last-year': 'Saved 1–2 years ago', old: 'Saved 2+ years ago', unknown: 'Save date unknown' };
const FAVICON_COLORS = ['#a8721f', '#3a5f7a', '#3f7a5c', '#8a5c63', '#5c5a8a', '#7a5c3a', '#4a6b6b', '#6b4a6b'];

const FACETS = [
  { key: 'status', railId: 'railStatus', getValue: (it) => it.status, labels: STATUS_LABELS, order: ['unreviewed', 'keep', 'read-later', 'delete-candidate'] },
  { key: 'topic', railId: 'railTopic', getValue: (it) => it.topicCluster || 'Not analyzed yet', pinLast: ['Unclustered', 'Not analyzed yet'] },
  { key: 'folder', railId: 'railFolder', getValue: (it) => topFolder(it.folder) },
  { key: 'type', railId: 'railType', getValue: (it) => guessContentType(it.url), order: ['Article', 'Document/PDF', 'Podcast', 'Video'] },
  { key: 'freshness', railId: 'railFreshness', getValue: (it) => guessFreshness(it.savedAt).bucket, labels: FRESHNESS_LABELS, order: ['new', 'this-year', 'last-year', 'old', 'unknown'] },
  { key: 'presence', railId: 'railPresence', getValue: (it) => it.presentInLatestImport ? 'in-latest' : 'not-in-latest', labels: { 'in-latest': 'In latest import', 'not-in-latest': 'Not in latest import' }, order: ['in-latest', 'not-in-latest'] }
];

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  currentAccount = getCurrentAccount();
  if (currentAccount) {
    await enterApp();
  } else {
    initGoogleSignIn(() => { currentAccount = getCurrentAccount(); enterApp(); });
    document.getElementById('guestBtn').addEventListener('click', () => continueAsGuest(() => { currentAccount = getCurrentAccount(); enterApp(); }));
  }
  wireStaticEvents();
});

async function enterApp() {
  document.getElementById('gateWrap').style.display = 'none';
  document.getElementById('appShell').style.display = 'block';
  document.getElementById('ownerName').textContent = currentAccount.name || 'Guest';
  const avatar = document.getElementById('ownerAvatar');
  if (currentAccount.picture) avatar.innerHTML = `<img src="${escapeAttr(currentAccount.picture)}" alt="" />`;
  else avatar.textContent = (currentAccount.name || 'G')[0].toUpperCase();

  bookmarks = await idbGetAllByAccount(currentAccount.id);
  renderAll();
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------
async function handleImportText(text, fileName) {
  const { items, skipped } = parseBookmarksHtml(text);
  if (items.length === 0) {
    showToast('No bookmarks found in that file — is it a Chrome bookmarks export (.html)?');
    return;
  }
  const account = currentAccount.id;
  const existingByCanonical = new Map(bookmarks.map(b => [b.canonicalUrl, b]));
  const now = Date.now();
  const touched = new Set();
  let added = 0, updated = 0, unchanged = 0;
  const toWrite = [];

  items.forEach(parsed => {
    const existing = existingByCanonical.get(parsed.canonicalUrl);
    if (existing) {
      touched.add(existing.id);
      const changed = existing.title !== parsed.title || existing.folder !== parsed.folder || existing.savedAt !== parsed.savedAt;
      existing.title = parsed.title;
      existing.folder = parsed.folder;
      if (parsed.savedAt) existing.savedAt = parsed.savedAt;
      existing.lastSeenImportAt = now;
      existing.presentInLatestImport = true;
      toWrite.push(existing);
      if (changed) updated++; else unchanged++;
    } else {
      const rec = {
        id: account + '::' + hashString(parsed.canonicalUrl),
        account, title: parsed.title, url: parsed.url, canonicalUrl: parsed.canonicalUrl,
        folder: parsed.folder, savedAt: parsed.savedAt, status: 'unreviewed',
        firstImportedAt: now, lastSeenImportAt: now, presentInLatestImport: true, manualBroken: false
      };
      bookmarks.push(rec);
      existingByCanonical.set(rec.canonicalUrl, rec);
      touched.add(rec.id);
      toWrite.push(rec);
      added++;
    }
  });

  let missing = 0;
  bookmarks.forEach(b => {
    if (!touched.has(b.id) && b.presentInLatestImport) {
      b.presentInLatestImport = false;
      toWrite.push(b);
      missing++;
    }
  });

  await idbBulkPut(toWrite);
  await idbAddImportRecord({ account, importedAt: now, fileName, added, updated, unchanged, skipped, missing });

  renderAll();
  const parts = [`${added} added`, `${updated} updated`, `${unchanged} unchanged`];
  if (missing) parts.push(`${missing} no longer in this export (kept, not deleted)`);
  if (skipped) parts.push(`${skipped} skipped (unsupported or local links)`);
  document.getElementById('importModalTitle').textContent = bookmarks.length === items.length && added === items.length ? 'Import complete' : 'Re-import complete';
  document.getElementById('importModalBody').textContent = parts.join(' · ') + '.';
  document.getElementById('importModal').classList.add('show');
}

function readAndImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => handleImportText(reader.result, file.name);
  reader.onerror = () => showToast('Could not read that file.');
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Status / triage
// ---------------------------------------------------------------------------
function getById(id) { return bookmarks.find(b => b.id === id); }

async function setStatus(id, value) {
  const rec = getById(id);
  if (!rec) return;
  rec.status = rec.status === value ? 'unreviewed' : value;
  await idbPut(rec);
  renderAll();
}

async function toggleBroken(id) {
  const rec = getById(id);
  if (!rec) return;
  rec.manualBroken = !rec.manualBroken;
  await idbPut(rec);
  renderAll();
}

// ---------------------------------------------------------------------------
// Content fetch + local clustering (free: one serverless function per page,
// no AI). Opt-in, cancelable, resumable — already-fetched pages are skipped
// on a re-run.
// ---------------------------------------------------------------------------
async function analyzeContent() {
  if (analysisRunning) return;
  const candidates = bookmarks.filter(b => b.fetchStatus !== 'ok');
  if (candidates.length === 0) {
    showToast('Every bookmark already has fetched content — import more to analyze them too.');
    return;
  }
  analysisRunning = true;
  analysisCancelled = false;
  document.getElementById('analyzeBtn').disabled = true;
  document.getElementById('analyzeProgress').style.display = 'block';
  const total = candidates.length;
  let done = 0;
  updateAnalyzeProgress(done, total);

  const CONCURRENCY = 8;
  let idx = 0;
  async function worker() {
    while (idx < candidates.length && !analysisCancelled) {
      const b = candidates[idx++];
      await fetchOnePage(b);
      done++;
      updateAnalyzeProgress(done, total);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  document.getElementById('analyzeProgress').style.display = 'none';
  document.getElementById('analyzeBtn').disabled = false;
  analysisRunning = false;

  await runClustering();
  renderAll();
  const okCount = bookmarks.filter(b => b.fetchStatus === 'ok').length;
  const failCount = bookmarks.filter(b => b.fetchStatus === 'failed').length;
  showToast(analysisCancelled
    ? `Stopped — checked ${done} of ${total} (${okCount} fetched so far, ${failCount} failed). Topics updated with what's in.`
    : `Fetched ${okCount} of ${total} pages (${failCount} couldn't be reached). Topics updated.`);
}

async function fetchOnePage(b) {
  try {
    const res = await fetch(`/api/fetch-page?url=${encodeURIComponent(b.url)}`);
    const data = await res.json();
    if (data.ok) {
      b.fetchStatus = 'ok';
      b.fetchedTitle = data.title || '';
      b.fetchedDescription = data.description || '';
      b.fetchedText = data.text || '';
      b.fetchFailReason = null;
    } else {
      b.fetchStatus = 'failed';
      b.fetchFailReason = data.reason || 'unknown';
    }
  } catch (e) {
    b.fetchStatus = 'failed';
    b.fetchFailReason = 'network_error';
  }
  b.fetchedAt = Date.now();
  await idbPut(b);
}

function updateAnalyzeProgress(done, total) {
  document.getElementById('analyzeProgressText').textContent = `Fetching page text… ${done} / ${total}`;
  document.getElementById('analyzeProgressFill').style.width = `${total ? (done / total * 100) : 0}%`;
}

async function runClustering() {
  const docs = bookmarks.map(b => {
    // A static HTML fetch of a video/podcast page is mostly player chrome,
    // not the actual content — trust only the title for those.
    const type = guessContentType(b.url);
    const fullTextOk = type !== 'Video' && type !== 'Podcast';
    const text = fullTextOk
      ? [b.fetchedTitle, b.fetchedDescription, b.fetchedText].filter(Boolean).join(' ') || b.title
      : b.title;
    return { id: b.id, text };
  });
  const labels = clusterDocuments(docs, { threshold: 0.12, minClusterSize: 3 });
  const toWrite = [];
  bookmarks.forEach(b => {
    const label = labels.get(b.id) || 'Unclustered';
    if (b.topicCluster !== label) { b.topicCluster = label; toWrite.push(b); }
  });
  if (toWrite.length) await idbBulkPut(toWrite);
}

// ---------------------------------------------------------------------------
// Facets / filtering
// ---------------------------------------------------------------------------
function matchesSearch(it) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  const hay = [it.title, it.url, it.folder, domainOf(it.url)].join(' ').toLowerCase();
  return hay.includes(q);
}
function matchesFacet(it, facetKey) {
  const set = filters[facetKey];
  if (set.size === 0) return true;
  const facet = FACETS.find(f => f.key === facetKey);
  return set.has(facet.getValue(it));
}
function matchesAllExcept(it, exceptKey) {
  return FACETS.every(f => f.key === exceptKey || matchesFacet(it, f.key)) && matchesSearch(it);
}
function matchesAll(it) {
  return FACETS.every(f => matchesFacet(it, f.key)) && matchesSearch(it);
}
function suggestionPredicate(it) {
  const fresh = guessFreshness(it.savedAt);
  return (fresh.bucket === 'old' || it.manualBroken) && it.status === 'unreviewed';
}
function getVisibleItems() {
  let list = suggestedMode ? bookmarks.filter(suggestionPredicate) : bookmarks.filter(matchesAll);
  list = list.slice().sort((a, b) => {
    switch (sortKey) {
      case 'saved-asc': return (a.savedAt || 0) - (b.savedAt || 0);
      case 'saved-desc': return (b.savedAt || 0) - (a.savedAt || 0);
      case 'title-asc': return a.title.localeCompare(b.title);
      case 'domain-asc': return domainOf(a.url).localeCompare(domainOf(b.url));
      default: return 0;
    }
  });
  if (suggestedMode) {
    list.sort((a, b) => (b.manualBroken ? 1 : 0) - (a.manualBroken ? 1 : 0) || (a.savedAt || 0) - (b.savedAt || 0));
  }
  return list;
}

// ---------------------------------------------------------------------------
// Render: rail
// ---------------------------------------------------------------------------
function renderRail() {
  document.getElementById('appRail').style.display = bookmarks.length ? 'block' : 'none';
  if (!bookmarks.length) return;
  FACETS.forEach(facet => {
    const container = document.getElementById(facet.railId);
    const baseList = bookmarks.filter(it => matchesAllExcept(it, facet.key));
    const counts = new Map();
    baseList.forEach(it => {
      const v = facet.getValue(it);
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    let values = Array.from(new Set(bookmarks.map(facet.getValue)));
    if (facet.order) {
      values = facet.order.filter(v => values.includes(v)).concat(values.filter(v => !facet.order.includes(v)));
    } else {
      values.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || String(a).localeCompare(String(b)));
    }
    if (facet.pinLast) {
      values = values.filter(v => !facet.pinLast.includes(v)).concat(facet.pinLast.filter(v => values.includes(v)));
    }
    container.innerHTML = values.map(v => {
      const count = counts.get(v) || 0;
      const checked = filters[facet.key].has(v);
      const label = (facet.labels && facet.labels[v]) || v;
      const disabled = count === 0 && !checked;
      return `<label class="rail-option ${checked ? 'active-label' : ''}" style="${disabled ? 'opacity:.4;' : ''}">
        <input type="checkbox" data-facet="${facet.key}" data-value="${escapeAttr(v)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
        ${escapeHtml(String(label))}
        <span class="count">${count}</span>
      </label>`;
    }).join('');
  });

  document.querySelectorAll('.app-rail input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const facet = cb.dataset.facet;
      const value = cb.dataset.value;
      if (cb.checked) filters[facet].add(value); else filters[facet].delete(value);
      renderAll();
    });
  });
}

function renderChips() {
  const chipsEl = document.getElementById('activeChips');
  const chips = [];
  FACETS.forEach(facet => {
    filters[facet.key].forEach(v => {
      const label = (facet.labels && facet.labels[v]) || v;
      chips.push({ facet: facet.key, value: v, label: escapeHtml(String(label)) });
    });
  });
  chipsEl.innerHTML = chips.map(c => `<span class="filter-chip">${c.label}<button data-facet="${c.facet}" data-value="${escapeAttr(c.value)}">&times;</button></span>`).join('');
  chipsEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => { filters[btn.dataset.facet].delete(btn.dataset.value); renderAll(); });
  });
}

// ---------------------------------------------------------------------------
// Render: stats
// ---------------------------------------------------------------------------
function renderStats() {
  const counts = { unreviewed: 0, keep: 0, 'read-later': 0, 'delete-candidate': 0 };
  bookmarks.forEach(b => counts[b.status] = (counts[b.status] || 0) + 1);
  const total = bookmarks.length || 1;
  document.getElementById('statsStrip').innerHTML = `
    <div class="stat-tile"><div class="n">${bookmarks.length}</div><div class="l">Total imported</div></div>
    <div class="stat-tile"><div class="n">${counts.unreviewed}</div><div class="l">Unreviewed</div></div>
    <div class="stat-tile"><div class="n">${counts.keep}</div><div class="l">Keep</div></div>
    <div class="stat-tile"><div class="n">${counts['read-later']}</div><div class="l">Read later</div></div>`;
  document.getElementById('statusBar').innerHTML = `
    <span class="seg-unreviewed" style="width:${counts.unreviewed / total * 100}%"></span>
    <span class="seg-keep" style="width:${counts.keep / total * 100}%"></span>
    <span class="seg-later" style="width:${counts['read-later'] / total * 100}%"></span>
    <span class="seg-delete" style="width:${counts['delete-candidate'] / total * 100}%"></span>`;
  document.getElementById('statusLegend').innerHTML = `
    <span><i style="background:var(--border)"></i>Unreviewed ${counts.unreviewed}</span>
    <span><i style="background:var(--good)"></i>Keep ${counts.keep}</span>
    <span><i style="background:var(--info)"></i>Read later ${counts['read-later']}</span>
    <span><i style="background:var(--danger)"></i>Delete candidate ${counts['delete-candidate']}</span>`;
}

// ---------------------------------------------------------------------------
// Render: list
// ---------------------------------------------------------------------------
function renderList() {
  const hasLibrary = bookmarks.length > 0;
  document.getElementById('onboardPanel').style.display = hasLibrary ? 'none' : 'block';
  document.getElementById('libraryView').style.display = hasLibrary ? 'block' : 'none';
  if (!hasLibrary) return;

  const visible = getVisibleItems();
  document.getElementById('countShown').textContent = visible.length;
  document.getElementById('countTotal').textContent = bookmarks.length;
  document.getElementById('queryCount').textContent = searchQuery ? `${visible.length} match${visible.length === 1 ? '' : 'es'}` : '';

  const listEl = document.getElementById('itemList');
  const emptyEl = document.getElementById('emptyState');
  if (visible.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
  } else {
    emptyEl.style.display = 'none';
    listEl.innerHTML = visible.map(renderItem).join('');
  }
  bindItemEvents();
  renderBulkBar();
  document.getElementById('selectAll').checked = visible.length > 0 && visible.every(it => selection.has(it.id));
}

function faviconColor(domain) {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) >>> 0;
  return FAVICON_COLORS[h % FAVICON_COLORS.length];
}
const FETCH_FAIL_REASONS = {
  invalid_or_blocked_url: 'blocked for safety', http_error: 'page returned an error', not_html: 'not an HTML page',
  too_large: 'page too large', timeout: 'timed out', network_error: 'network error', unknown: 'unknown error'
};
function humanizeFetchFail(reason) { return FETCH_FAIL_REASONS[reason] || 'could not fetch'; }

function summaryLine(it) {
  if (it.fetchStatus === 'ok') return it.fetchedDescription || 'Content fetched for clustering — no description found on the page.';
  if (it.fetchStatus === 'failed') return `Could not fetch this page (${humanizeFetchFail(it.fetchFailReason)}) — clustering falls back to the title only.`;
  return 'No summary — click "Cluster" to fetch page text for topic grouping (free, no AI).';
}

function formatDate(ms) {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderItem(it) {
  const domain = domainOf(it.url);
  const selected = selection.has(it.id);
  const contentType = guessContentType(it.url);
  const fresh = guessFreshness(it.savedAt);
  const savedLabel = formatDate(it.savedAt) || 'Save date unknown';

  const tags = [`<span class="tag folder-tag">${escapeHtml(it.folder)}</span>`];
  if (it.topicCluster && it.topicCluster !== 'Unclustered') tags.push(`<span class="tag topic-tag">${escapeHtml(it.topicCluster)}</span>`);
  tags.push(`<span class="tag ${fresh.bucket}">${escapeHtml(fresh.label)}</span>`);
  if (!it.presentInLatestImport) tags.push(`<span class="tag not-latest">Not in latest import</span>`);
  if (it.manualBroken) tags.push(`<span class="tag broken">Reported broken</span>`);
  if (it.fetchStatus === 'failed') tags.push(`<span class="tag broken" title="${escapeAttr(humanizeFetchFail(it.fetchFailReason))}">Content not fetched</span>`);

  return `
  <div class="item-card ${selected ? 'selected' : ''}" data-id="${it.id}">
    <input type="checkbox" class="item-check" data-select="${it.id}" ${selected ? 'checked' : ''} />
    <div class="item-favicon" style="background:${faviconColor(domain)};">${domain[0] ? domain[0].toUpperCase() : '?'}</div>
    <div class="item-body">
      <div class="item-top-row">
        <a class="item-title" href="${escapeAttr(it.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.title)}</a>
        <span class="type-badge">${escapeHtml(contentType)}</span>
      </div>
      <div class="item-meta">
        <span>${escapeHtml(domain)}</span><span class="sep">·</span>
        <span class="folder-path">${escapeHtml(it.folder)}</span><span class="sep">·</span>
        <span>Saved ${savedLabel}</span>
      </div>
      <div class="item-summary">${escapeHtml(summaryLine(it))}</div>
      <div class="badge-row">
        ${tags.join('')}
        <button class="report-broken-btn" data-report="${it.id}">${it.manualBroken ? 'Undo broken report' : 'Report broken link'}</button>
      </div>
    </div>
    <div class="item-actions">
      <div class="status-group">
        <button class="status-btn keep ${it.status === 'keep' ? 'is-active' : ''}" data-id="${escapeAttr(it.id)}" data-set-status="keep">Keep</button>
        <button class="status-btn later ${it.status === 'read-later' ? 'is-active' : ''}" data-id="${escapeAttr(it.id)}" data-set-status="read-later">Read later</button>
        <button class="status-btn delete ${it.status === 'delete-candidate' ? 'is-active' : ''}" data-id="${escapeAttr(it.id)}" data-set-status="delete-candidate">Delete candidate</button>
      </div>
      ${it.status === 'unreviewed' ? '<span class="unreviewed-label">Unreviewed</span>' : ''}
    </div>
  </div>`;
}

function bindItemEvents() {
  document.querySelectorAll('[data-select]').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.select;
      if (cb.checked) selection.add(id); else selection.delete(id);
      renderList();
    });
  });
  document.querySelectorAll('[data-set-status]').forEach(btn => {
    btn.addEventListener('click', () => setStatus(btn.dataset.id, btn.dataset.setStatus));
  });
  document.querySelectorAll('[data-report]').forEach(btn => {
    btn.addEventListener('click', () => toggleBroken(btn.dataset.report));
  });
}

function renderBulkBar() {
  const bar = document.getElementById('bulkBar');
  bar.classList.toggle('show', selection.size > 0);
  document.getElementById('bulkCount').textContent = selection.size;
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-bulk]');
  if (!btn) return;
  const value = btn.dataset.bulk;
  const label = STATUS_LABELS[value];
  const ids = Array.from(selection);
  if (ids.length === 0) return;
  const ok = confirm(`Mark ${ids.length} bookmark${ids.length === 1 ? '' : 's'} as ${label}?`);
  if (!ok) return;
  lastBulkSnapshot = ids.map(id => ({ id, prev: getById(id).status }));
  const toWrite = [];
  ids.forEach(id => { const r = getById(id); r.status = value; toWrite.push(r); });
  await idbBulkPut(toWrite);
  selection.clear();
  renderAll();
  showToast(`Marked ${ids.length} bookmark${ids.length === 1 ? '' : 's'} as ${label}.`, {
    actionLabel: 'Undo',
    onAction: async () => {
      const restore = lastBulkSnapshot.map(({ id, prev }) => { const r = getById(id); r.status = prev; return r; });
      await idbBulkPut(restore);
      renderAll();
    }
  });
});

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
function showToast(message, opts) {
  opts = opts || {};
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  if (opts.actionLabel) {
    const b = document.createElement('button');
    b.textContent = opts.actionLabel;
    b.addEventListener('click', () => { opts.onAction && opts.onAction(); el.remove(); });
    el.appendChild(b);
  }
  wrap.appendChild(el);
  setTimeout(() => el.remove(), opts.actionLabel ? 6000 : 3200);
}

// ---------------------------------------------------------------------------
// Suggested queue
// ---------------------------------------------------------------------------
function cloneFilters(f) { const out = {}; Object.keys(f).forEach(k => out[k] = new Set(f[k])); return out; }
function enterSuggested() {
  preSuggestState = { filters: cloneFilters(filters), searchQuery, sortKey };
  filters = { status: new Set(), folder: new Set(), type: new Set(), freshness: new Set(), presence: new Set(), topic: new Set() };
  searchQuery = '';
  document.getElementById('searchInput').value = '';
  suggestedMode = true;
  document.getElementById('suggestedToggle').classList.add('active');
  document.getElementById('suggestedBanner').style.display = 'flex';
  renderAll();
}
function exitSuggested() {
  suggestedMode = false;
  if (preSuggestState) {
    filters = preSuggestState.filters; searchQuery = preSuggestState.searchQuery; sortKey = preSuggestState.sortKey;
    document.getElementById('searchInput').value = searchQuery;
    document.getElementById('sortSelect').value = sortKey;
  }
  document.getElementById('suggestedToggle').classList.remove('active');
  document.getElementById('suggestedBanner').style.display = 'none';
  renderAll();
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
function downloadBlob(content, mime, filename) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function exportCsv() {
  const rows = getVisibleItems().map(it => ({
    title: it.title, url: it.url, domain: domainOf(it.url), folder: it.folder,
    topic: it.topicCluster || '', contentType: guessContentType(it.url), saved: guessFreshness(it.savedAt).label,
    savedDate: it.savedAt ? new Date(it.savedAt).toISOString().slice(0, 10) : '',
    status: it.status, reportedBroken: it.manualBroken ? 'yes' : 'no',
    contentFetched: it.fetchStatus === 'ok' ? 'yes' : it.fetchStatus === 'failed' ? 'failed' : 'not attempted',
    inLatestImport: it.presentInLatestImport ? 'yes' : 'no'
  }));
  if (rows.length === 0) { showToast('Nothing to export with the current filters.'); return; }
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))).join('\n');
  downloadBlob(csv, 'text/csv', 'bookmark-library-export.csv');
  showToast(`Exported ${rows.length} bookmark${rows.length === 1 ? '' : 's'} as CSV.`);
}
function exportHtmlKeep() {
  const items = bookmarks.filter(b => b.status === 'keep' || b.status === 'read-later');
  if (items.length === 0) { showToast('No bookmarks marked Keep or Read later yet.'); return; }
  const byFolder = new Map();
  items.forEach(it => {
    const key = it.folder || 'Uncategorized';
    if (!byFolder.has(key)) byFolder.set(key, []);
    byFolder.get(key).push(it);
  });
  let body = '';
  byFolder.forEach((list, folder) => {
    body += `    <DT><H3>${escapeHtml(folder)}</H3>\n    <DL><p>\n`;
    list.forEach(it => {
      const addDate = Math.floor((it.savedAt || Date.now()) / 1000);
      body += `        <DT><A HREF="${escapeAttr(it.url)}" ADD_DATE="${addDate}">${escapeHtml(it.title)}</A>\n`;
    });
    body += `    </DL><p>\n`;
  });
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n${body}</DL><p>\n`;
  downloadBlob(html, 'text/html', 'bookmark-library-keep-and-read-later.html');
  showToast(`Exported ${items.length} bookmark${items.length === 1 ? '' : 's'} as an importable HTML file.`);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------
function renderAll() {
  renderStats();
  renderRail();
  renderChips();
  renderList();
}

function wireStaticEvents() {
  const fileInput = document.getElementById('fileInput');
  const triggerFile = () => fileInput.click();
  document.getElementById('importBtn').addEventListener('click', triggerFile);
  document.getElementById('railImportBtn').addEventListener('click', triggerFile);
  document.getElementById('onboardUploadBtn').addEventListener('click', triggerFile);
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) readAndImportFile(fileInput.files[0]); fileInput.value = ''; });

  const onboard = document.getElementById('onboardPanel');
  ['dragover', 'dragenter'].forEach(evt => onboard.addEventListener(evt, (e) => { e.preventDefault(); onboard.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach(evt => onboard.addEventListener(evt, (e) => { e.preventDefault(); onboard.classList.remove('drag-over'); }));
  onboard.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) readAndImportFile(f); });

  document.getElementById('searchInput').addEventListener('input', (e) => { searchQuery = e.target.value.trim(); renderList(); });
  document.getElementById('sortSelect').addEventListener('change', (e) => { sortKey = e.target.value; renderList(); });

  document.getElementById('clearAllFilters').addEventListener('click', () => {
    Object.keys(filters).forEach(k => filters[k].clear());
    searchQuery = ''; document.getElementById('searchInput').value = '';
    renderAll();
  });
  document.getElementById('emptyReset').addEventListener('click', () => {
    Object.keys(filters).forEach(k => filters[k].clear());
    searchQuery = ''; document.getElementById('searchInput').value = '';
    if (suggestedMode) exitSuggested(); else renderAll();
  });

  document.getElementById('selectAll').addEventListener('change', (e) => {
    const visible = getVisibleItems();
    if (e.target.checked) visible.forEach(it => selection.add(it.id));
    else visible.forEach(it => selection.delete(it.id));
    renderList();
  });
  document.getElementById('bulkClear').addEventListener('click', () => { selection.clear(); renderList(); });

  document.getElementById('analyzeBtn').addEventListener('click', analyzeContent);
  document.getElementById('analyzeCancelBtn').addEventListener('click', () => { analysisCancelled = true; });

  document.getElementById('suggestedToggle').addEventListener('click', () => { suggestedMode ? exitSuggested() : enterSuggested(); });
  document.getElementById('suggestedClose').addEventListener('click', exitSuggested);

  document.getElementById('importModalClose').addEventListener('click', () => document.getElementById('importModal').classList.remove('show'));
  document.getElementById('importModalOk').addEventListener('click', () => document.getElementById('importModal').classList.remove('show'));

  // Export modal
  document.getElementById('exportMenuBtn').addEventListener('click', () => document.getElementById('exportModal').classList.add('show'));
  document.getElementById('exportModalClose').addEventListener('click', () => document.getElementById('exportModal').classList.remove('show'));
  document.getElementById('exportCsvBtn').addEventListener('click', () => { exportCsv(); document.getElementById('exportModal').classList.remove('show'); });
  document.getElementById('exportHtmlBtn').addEventListener('click', () => { exportHtmlKeep(); document.getElementById('exportModal').classList.remove('show'); });

  // Owner dropdown
  const ownerChip = document.getElementById('ownerChip');
  const ownerDropdown = document.getElementById('ownerDropdown');
  ownerChip.addEventListener('click', (e) => { e.stopPropagation(); ownerDropdown.classList.toggle('show'); });
  document.addEventListener('click', () => ownerDropdown.classList.remove('show'));

  document.getElementById('menuSignOut').addEventListener('click', signOut);
  document.getElementById('menuClearLibrary').addEventListener('click', async () => {
    if (!confirm(`Delete all ${bookmarks.length} imported bookmarks for this account? This only affects this browser and cannot be undone.`)) return;
    await idbDeleteAccount(currentAccount.id);
    bookmarks = [];
    renderAll();
    showToast('Library cleared.');
  });

  // Settings modal (Google Client ID)
  const settingsModal = document.getElementById('settingsModal');
  const openSettings = () => { document.getElementById('clientIdInput').value = getConfiguredClientId(); settingsModal.classList.add('show'); };
  document.getElementById('menuSettings').addEventListener('click', openSettings);
  const gateLink = document.getElementById('openSettingsFromGate');
  if (gateLink) gateLink.addEventListener('click', openSettings);
  document.getElementById('settingsModalClose').addEventListener('click', () => settingsModal.classList.remove('show'));
  document.getElementById('saveClientId').addEventListener('click', () => {
    const val = document.getElementById('clientIdInput').value.trim();
    setConfiguredClientId(val);
    location.reload();
  });
  document.getElementById('clearClientId').addEventListener('click', () => {
    setConfiguredClientId('');
    location.reload();
  });
}

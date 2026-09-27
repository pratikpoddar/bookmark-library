// ============================================================================
// Bookmark Library — demo library (mock data, fully client-side)
// Nothing here calls a network. Triage decisions persist to localStorage
// under this origin only, matching the spec's "private by default" stance.
// ============================================================================

const STORAGE_KEY = 'bmlib_demo_status_v1';

const FAVICON_COLORS = ['#a8721f', '#3a5f7a', '#3f7a5c', '#8a5c63', '#5c5a8a', '#7a5c3a', '#4a6b6b', '#6b4a6b'];

const ITEMS = [
  {
    id: 'b01', title: 'Context windows and the case for cheap memory', domain: 'arxiv.org',
    folder: 'Research/Papers/2025', savedDate: '2025-11-02', pubDate: '2025-10-20', pubConfidence: 'high',
    type: 'Document/PDF', topic: 'AI agents',
    summary: 'Argues retrieval cost, not context length, is the real constraint on long-running agents.',
    summarySource: 'content', freshness: 'recent', freshnessReason: 'Published within the last year; topic still actively discussed.',
    fetch: 'ok'
  },
  {
    id: 'b02', title: 'Agent evaluation harness — design notes', domain: 'notes.dev',
    folder: 'Research/Papers/2025', savedDate: '2025-06-14', pubDate: null, pubConfidence: 'unknown',
    type: 'Document/PDF', topic: 'AI agents',
    summary: null, summarySource: 'title', freshness: 'unknown', freshnessReason: 'No publication date detected — reference material can stay useful for years.',
    fetch: 'ok'
  },
  {
    id: 'b03', title: 'Building agent memory that survives a restart', domain: 'read-later.io',
    folder: 'Podcasts/Startups', savedDate: '2026-01-09', pubDate: '2026-01-05', pubConfidence: 'high',
    type: 'Long podcast', topic: 'AI agents',
    summary: 'A 58-minute conversation on durable state for autonomous agents across sessions.',
    summarySource: 'content', freshness: 'recent', freshnessReason: 'Recent episode on an actively evolving topic.',
    fetch: 'ok'
  },
  {
    id: 'b04', title: 'Series A pricing trends, Q1 2024 review', domain: 'founders-weekly.substack.com',
    folder: 'New folder (3)/Reading', savedDate: '2024-03-11', pubDate: '2024-03-08', pubConfidence: 'high',
    type: 'Article', topic: 'Venture capital',
    summary: 'Quarterly pricing data now well over a year old — figures have likely been superseded.',
    summarySource: 'content', freshness: 'old', freshnessReason: 'Time-bound market data from early 2024; multiple funding cycles have passed.',
    fetch: 'ok'
  },
  {
    id: 'b05', title: 'Why late-stage rounds are getting smaller', domain: 'insider-briefing.co',
    folder: 'New folder (3)/Reading', savedDate: '2025-09-01', pubDate: '2025-08-28', pubConfidence: 'medium',
    type: 'Article', topic: 'Venture capital',
    summary: null, summarySource: null, freshness: 'review', freshnessReason: 'Market commentary — worth a skim to confirm it still tracks current rounds.',
    fetch: 'paywall'
  },
  {
    id: 'b06', title: 'LP allocation survey, historical dataset', domain: 'data.capitalnotes.org',
    folder: 'Finance/Notes', savedDate: '2025-02-20', pubDate: null, pubConfidence: 'unknown',
    type: 'Document/PDF', topic: 'Venture capital',
    summary: 'Raw survey tables with no accompanying narrative — dataset only.',
    summarySource: 'content', freshness: 'unknown', freshnessReason: 'Undated dataset export; treat as reference, not current commentary.',
    fetch: 'ok'
  },
  {
    id: 'b07', title: 'A smaller, faster local dev loop with layered caching', domain: 'devtools.blog',
    folder: 'Docs/Engineering', savedDate: '2026-04-18', pubDate: '2026-04-15', pubConfidence: 'high',
    type: 'Article', topic: 'Developer tools',
    summary: 'Walks through incremental build caching that cut a large monorepo’s rebuild time by 70%.',
    summarySource: 'content', freshness: 'recent', freshnessReason: 'Published this year; toolchain specifics still current.',
    fetch: 'ok'
  },
  {
    id: 'b08', title: 'cluster autoscaling — internal reference', domain: 'internal-wiki.dev',
    folder: 'Docs/Engineering', savedDate: '2023-08-02', pubDate: null, pubConfidence: 'unknown',
    type: 'Document/PDF', topic: 'Developer tools',
    summary: null, summarySource: null, freshness: 'unknown', freshnessReason: 'Could not verify freshness — no publication date detected in the document.',
    fetch: 'ok'
  },
  {
    id: 'b09', title: 'Watch: profiling a Rust async runtime under load', domain: 'streams.dev',
    folder: 'Docs/Engineering', savedDate: '2026-02-27', pubDate: '2026-02-20', pubConfidence: 'high',
    type: 'Video', topic: 'Developer tools',
    summary: 'A 34-minute walkthrough profiling tail latency in a tokio-based service.',
    summarySource: 'content', freshness: 'recent', freshnessReason: 'Recent upload; runtime version discussed is current.',
    fetch: 'ok'
  },
  {
    id: 'b10', title: 'Migrating off a deprecated build tool: a war story', domain: 'oldposts.example',
    folder: 'Docs/Engineering', savedDate: '2022-05-19', pubDate: '2022-05-10', pubConfidence: 'medium',
    type: 'Article', topic: 'Developer tools',
    summary: null, summarySource: null, freshness: 'unknown', freshnessReason: 'Fetch failed — freshness could not be checked against current content.',
    fetch: 'broken'
  },
  {
    id: 'b11', title: 'What the newest sleep-tracking studies actually show', domain: 'longevity.today',
    folder: 'Reading list', savedDate: '2025-12-05', pubDate: '2025-11-30', pubConfidence: 'high',
    type: 'Article', topic: 'Health & longevity',
    summary: 'Separates well-powered studies from small-sample results getting recirculated as consensus.',
    summarySource: 'content', freshness: 'review', freshnessReason: 'Active research area — worth confirming no newer study has revised this.',
    fetch: 'ok'
  },
  {
    id: 'b12', title: 'The metabolic-health episode everyone sent me in 2023', domain: 'longevity.today',
    folder: 'Podcasts/Startups', savedDate: '2023-06-22', pubDate: '2023-06-15', pubConfidence: 'high',
    type: 'Long podcast', topic: 'Health & longevity',
    summary: 'A 95-minute deep dive that was widely shared two research cycles ago.',
    summarySource: 'content', freshness: 'old', freshnessReason: 'Guidance in this space has moved on since 2023; treat claims as dated.',
    fetch: 'ok'
  },
  {
    id: 'b13', title: 'A short, skeptical take on continuous glucose monitors', domain: 'plainhealth.co',
    folder: 'Reading list', savedDate: '2026-06-01', pubDate: '2026-05-28', pubConfidence: 'high',
    type: 'Article', topic: 'Health & longevity',
    summary: 'Reviews the evidence gap between CGM marketing and non-diabetic use cases.',
    summarySource: 'content', freshness: 'recent', freshnessReason: 'Published recently; references current-generation devices.',
    fetch: 'ok'
  },
  {
    id: 'b14', title: 'Grid-scale storage costs fell faster than forecast', domain: 'gridwatch.energy',
    folder: 'Climate', savedDate: '2026-03-14', pubDate: '2026-03-10', pubConfidence: 'high',
    type: 'Article', topic: 'Climate & energy',
    summary: 'Battery storage cost curves beat last year’s projections across three markets.',
    summarySource: 'content', freshness: 'recent', freshnessReason: 'Recent data release; figures are this year’s.',
    fetch: 'ok'
  },
  {
    id: 'b15', title: 'IPCC working group methodology, reference edition', domain: 'reports.climatebody.org',
    folder: 'Climate', savedDate: '2024-10-09', pubDate: '2023-03-01', pubConfidence: 'high',
    type: 'Document/PDF', topic: 'Climate & energy',
    summary: 'Methodology reference — the kind of document that stays useful across editions.',
    summarySource: 'content', freshness: 'unknown', freshnessReason: 'Reference documentation; dated but not time-sensitive.',
    fetch: 'ok'
  },
  {
    id: 'b16', title: 'Emergency summit reaches draft agreement on emissions', domain: 'wire-briefs.news',
    folder: 'Climate', savedDate: '2024-11-20', pubDate: '2024-11-19', pubConfidence: 'high',
    type: 'Article', topic: 'Climate & energy',
    summary: null, summarySource: null, freshness: 'old', freshnessReason: 'Breaking-news coverage of a since-concluded summit; almost certainly superseded.',
    fetch: 'broken'
  },
  {
    id: 'b17', title: 'The only bread recipe you need to memorize', domain: 'slowkitchen.co',
    folder: 'Uncategorized', savedDate: '2023-01-15', pubDate: '2021-09-04', pubConfidence: 'medium',
    type: 'Article', topic: 'Cooking',
    summary: 'A no-knead loaf recipe with ratios rather than exact measurements.',
    summarySource: 'content', freshness: 'unknown', freshnessReason: 'Recipe content ages slowly regardless of publish date.',
    fetch: 'ok'
  },
  {
    id: 'b18', title: 'Knife skills in twelve minutes', domain: 'slowkitchen.co',
    folder: 'Uncategorized', savedDate: '2022-11-02', pubDate: '2020-02-18', pubConfidence: 'medium',
    type: 'Video', topic: 'Cooking',
    summary: 'A short technique video — dicing, julienne, and chiffonade.',
    summarySource: 'content', freshness: 'unknown', freshnessReason: 'Technique content; not time-sensitive.',
    fetch: 'ok'
  },
  {
    id: 'b19', title: 'Our favorite holiday cookie roundup, 2021 edition', domain: 'slowkitchen.co',
    folder: 'Uncategorized', savedDate: '2021-12-10', pubDate: '2021-12-01', pubConfidence: 'high',
    type: 'Article', topic: 'Cooking',
    summary: null, summarySource: null, freshness: 'old', freshnessReason: 'Seasonal roundup tied to a specific year’s roundup cycle.',
    fetch: 'ok'
  },
  {
    id: 'b20', title: 'Rebalancing rules for a three-fund portfolio', domain: 'plainmoney.blog',
    folder: 'Finance/Notes', savedDate: '2025-08-19', pubDate: '2025-07-30', pubConfidence: 'high',
    type: 'Article', topic: 'Personal finance',
    summary: 'Mechanical rebalancing bands rather than calendar-based rebalancing.',
    summarySource: 'content', freshness: 'review', freshnessReason: 'Tax and account rules referenced change yearly — worth a relevance check.',
    fetch: 'ok'
  },
  {
    id: 'b21', title: 'Historical asset-class return tables (long series)', domain: 'data.plainmoney.blog',
    folder: 'Finance/Notes', savedDate: '2025-01-04', pubDate: null, pubConfidence: 'unknown',
    type: 'Document/PDF', topic: 'Personal finance',
    summary: 'Long-run return series used for back-of-envelope portfolio math.',
    summarySource: 'content', freshness: 'unknown', freshnessReason: 'Long-run reference dataset; usefulness does not decay quickly.',
    fetch: 'ok'
  },
  {
    id: 'b22', title: '2023 tax-year changes you probably missed', domain: 'insider-briefing.co',
    folder: 'Finance/Notes', savedDate: '2023-02-14', pubDate: '2023-02-01', pubConfidence: 'high',
    type: 'Article', topic: 'Personal finance',
    summary: null, summarySource: null, freshness: 'old', freshnessReason: 'Tied to a specific past tax year; rules have since changed.',
    fetch: 'paywall'
  },
  {
    id: 'b23', title: 'Token-first design systems are eating component libraries', domain: 'designnotes.io',
    folder: 'Design/Inspiration', savedDate: '2026-05-22', pubDate: '2026-05-18', pubConfidence: 'high',
    type: 'Article', topic: 'Design systems',
    summary: 'Traces the shift from component-first to token-first systems across three large teams.',
    summarySource: 'content', freshness: 'recent', freshnessReason: 'Published recently; reflects current tooling.',
    fetch: 'ok'
  },
  {
    id: 'b24', title: 'Community file — icon grid starter', domain: 'community.figma.com',
    folder: 'Design/Inspiration', savedDate: '2024-09-08', pubDate: null, pubConfidence: 'unknown',
    type: 'Other/Unknown', topic: 'Design systems',
    summary: null, summarySource: 'title', freshness: 'unknown', freshnessReason: 'Community file — no metadata date available; title-based label only.',
    fetch: 'ok'
  },
  {
    id: 'b25', title: 'New folder (2) item — untitled save', domain: 'link-shortener.example',
    folder: 'Uncategorized', savedDate: '2021-04-30', pubDate: null, pubConfidence: 'unknown',
    type: 'Other/Unknown', topic: 'Unclassified',
    summary: null, summarySource: null, freshness: 'unknown', freshnessReason: 'Fetch failed — could not verify content, date, or type.',
    fetch: 'broken'
  },
  {
    id: 'b26', title: 'A running list of good long-form interviews', domain: 'read-later.io',
    folder: 'Reading list', savedDate: '2026-08-11', pubDate: '2026-08-01', pubConfidence: 'medium',
    type: 'Article', topic: 'Unclassified',
    summary: 'A living list of interview links — no single dominant topic detected yet.',
    summarySource: 'content', freshness: 'recent', freshnessReason: 'Recently saved and recently updated at the source.',
    fetch: 'ok'
  }
];

const FRESHNESS_LABEL = {
  recent: 'Recent',
  old: 'Likely old news',
  review: 'Review for relevance',
  unknown: 'Evergreen/unknown'
};
const FETCH_LABEL = {
  broken: 'Broken/unreachable',
  paywall: 'Needs access',
  ok: null
};
const TYPE_ABBR = {
  'Article': 'Article',
  'Document/PDF': 'PDF',
  'Long podcast': 'Podcast',
  'Video': 'Video',
  'Other/Unknown': 'Other'
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let statusMap = loadStatus();
let filters = { status: new Set(), topic: new Set(), type: new Set(), freshness: new Set(), fetch: new Set(), folder: new Set() };
let searchQuery = '';
let sortKey = 'saved-desc';
let selection = new Set();
let suggestedMode = false;
let preSuggestState = null;
let lastBulkSnapshot = null;

function loadStatus() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function saveStatus() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(statusMap)); } catch (e) {}
}
function getStatus(id) { return statusMap[id] || 'unreviewed'; }
function setStatus(id, value) {
  if (value === 'unreviewed') delete statusMap[id];
  else statusMap[id] = value;
  saveStatus();
}

function faviconColor(domain) {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) >>> 0;
  return FAVICON_COLORS[h % FAVICON_COLORS.length];
}
function faviconLetter(domain) { return domain.replace(/^www\./, '')[0].toUpperCase(); }

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Facets
// ---------------------------------------------------------------------------
const FACETS = [
  { key: 'status', railId: 'railStatus', getValue: (it) => getStatus(it.id), labels: { 'unreviewed': 'Unreviewed', 'keep': 'Keep', 'read-later': 'Read later', 'delete-candidate': 'Delete candidate' }, order: ['unreviewed', 'keep', 'read-later', 'delete-candidate'] },
  { key: 'topic', railId: 'railTopic', getValue: (it) => it.topic },
  { key: 'type', railId: 'railType', getValue: (it) => it.type, order: ['Article', 'Document/PDF', 'Long podcast', 'Video', 'Other/Unknown'] },
  { key: 'freshness', railId: 'railFreshness', getValue: (it) => it.freshness, labels: FRESHNESS_LABEL, order: ['recent', 'review', 'old', 'unknown'] },
  { key: 'fetch', railId: 'railFetch', getValue: (it) => it.fetch, labels: { ok: 'Fetched OK', broken: 'Broken/unreachable', paywall: 'Needs access' }, order: ['ok', 'broken', 'paywall'] },
  { key: 'folder', railId: 'railFolder', getValue: (it) => it.folder }
];

function matchesSearch(it) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  const hay = [it.title, it.domain, it.folder, it.topic, it.summary || ''].join(' ').toLowerCase();
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
  const flagged = it.freshness === 'old' || it.freshness === 'review' || it.fetch === 'broken' || it.fetch === 'paywall';
  return flagged && getStatus(it.id) === 'unreviewed';
}

function getVisibleItems() {
  let list = suggestedMode ? ITEMS.filter(suggestionPredicate) : ITEMS.filter(matchesAll);
  list = list.slice().sort((a, b) => {
    switch (sortKey) {
      case 'saved-asc': return a.savedDate.localeCompare(b.savedDate);
      case 'saved-desc': return b.savedDate.localeCompare(a.savedDate);
      case 'pub-desc': return (b.pubDate || '0000').localeCompare(a.pubDate || '0000');
      case 'title-asc': return a.title.localeCompare(b.title);
      case 'domain-asc': return a.domain.localeCompare(b.domain);
      default: return 0;
    }
  });
  if (suggestedMode) {
    const weight = { old: 0, review: 1, unknown: 2, recent: 3 };
    list.sort((a, b) => (weight[a.freshness] - weight[b.freshness]) || (a.fetch === 'ok' ? 1 : -1));
  }
  return list;
}

// ---------------------------------------------------------------------------
// Rendering: rail
// ---------------------------------------------------------------------------
function renderRail() {
  FACETS.forEach(facet => {
    const container = document.getElementById(facet.railId);
    const baseList = ITEMS.filter(it => matchesAllExcept(it, facet.key));
    const counts = new Map();
    baseList.forEach(it => {
      const v = facet.getValue(it);
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    let values = Array.from(new Set(ITEMS.map(facet.getValue)));
    if (facet.order) {
      values = facet.order.filter(v => values.includes(v)).concat(values.filter(v => !facet.order.includes(v)));
    } else {
      values.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || String(a).localeCompare(String(b)));
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

  container_bind_checkboxes();
}

function container_bind_checkboxes() {
  document.querySelectorAll('#app-rail-root input[type=checkbox]').forEach(() => {});
  document.querySelectorAll('.app-rail input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const facet = cb.dataset.facet;
      const value = cb.dataset.value;
      if (cb.checked) filters[facet].add(value); else filters[facet].delete(value);
      renderAll();
    });
  });
}

// ---------------------------------------------------------------------------
// Rendering: chips + counts
// ---------------------------------------------------------------------------
function renderChips() {
  const chipsEl = document.getElementById('activeChips');
  const chips = [];
  FACETS.forEach(facet => {
    filters[facet.key].forEach(v => {
      const label = (facet.labels && facet.labels[v]) || v;
      chips.push({ facet: facet.key, value: v, label: `${escapeHtml(String(label))}` });
    });
  });
  chipsEl.innerHTML = chips.map(c => `<span class="filter-chip">${c.label}<button data-facet="${c.facet}" data-value="${escapeAttr(c.value)}">&times;</button></span>`).join('');
  chipsEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      filters[btn.dataset.facet].delete(btn.dataset.value);
      renderAll();
    });
  });
}

// ---------------------------------------------------------------------------
// Rendering: list
// ---------------------------------------------------------------------------
function renderList() {
  const visible = getVisibleItems();
  document.getElementById('countShown').textContent = visible.length;
  document.getElementById('countTotal').textContent = ITEMS.length;
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

function renderItem(it) {
  const status = getStatus(it.id);
  const selected = selection.has(it.id);
  const savedLabel = formatDate(it.savedDate);
  const pubLabel = it.pubDate ? `Published ${formatDate(it.pubDate)}${it.pubConfidence === 'medium' ? ' (medium confidence)' : it.pubConfidence === 'low' ? ' (low confidence)' : ''}` : 'Publication date unknown';

  let summaryHtml;
  if (it.fetch === 'broken') {
    summaryHtml = `<div class="item-summary failed">Could not summarize — page is unreachable. Original URL and folder preserved.</div>`;
  } else if (it.fetch === 'paywall') {
    summaryHtml = `<div class="item-summary failed">Could not summarize — content needs access (paywall). Not treated as a dead link.</div>`;
  } else if (!it.summary && it.summarySource === 'title') {
    summaryHtml = `<div class="item-summary title-based">Title-based only — content could not be summarized.</div>`;
  } else if (!it.summary) {
    summaryHtml = `<div class="item-summary failed">Could not summarize.</div>`;
  } else {
    summaryHtml = `<div class="item-summary">${escapeHtml(it.summary)}</div>`;
  }

  const freshTag = `<span class="tag ${it.freshness}" title="${escapeAttr(it.freshnessReason)}">${FRESHNESS_LABEL[it.freshness]}</span>`;
  const fetchLabel = FETCH_LABEL[it.fetch];
  const fetchTag = fetchLabel ? `<span class="tag ${it.fetch}">${fetchLabel}</span>` : '';
  const topicTag = `<span class="tag unknown" style="background:var(--paper-alt);color:var(--ink-soft);">${escapeHtml(it.topic)}</span>`;

  const retryBtn = it.fetch === 'broken' ? `<button class="retry-link" data-retry="${it.id}">Retry fetch</button>` : '';

  return `
  <div class="item-card ${selected ? 'selected' : ''}" data-id="${it.id}">
    <input type="checkbox" class="item-check" data-select="${it.id}" ${selected ? 'checked' : ''} />
    <div class="item-favicon" style="background:${faviconColor(it.domain)};">${faviconLetter(it.domain)}</div>
    <div class="item-body">
      <div class="item-top-row">
        <button class="item-title" data-open="${it.id}">${escapeHtml(it.title)}</button>
        <span class="type-badge">${TYPE_ABBR[it.type]}</span>
      </div>
      <div class="item-meta">
        <span>${escapeHtml(it.domain)}</span><span class="sep">·</span>
        <span class="folder-path">${escapeHtml(it.folder)}</span><span class="sep">·</span>
        <span>Saved ${savedLabel}</span><span class="sep">·</span>
        <span>${pubLabel}</span>
      </div>
      ${summaryHtml}
      <div class="badge-row">
        ${topicTag}${freshTag}${fetchTag}${retryBtn}
      </div>
    </div>
    <div class="item-actions">
      <div class="status-group">
        <button class="status-btn keep ${status === 'keep' ? 'is-active' : ''}" data-status="${it.id}:keep">Keep</button>
        <button class="status-btn later ${status === 'read-later' ? 'is-active' : ''}" data-status="${it.id}:read-later">Read later</button>
        <button class="status-btn delete ${status === 'delete-candidate' ? 'is-active' : ''}" data-status="${it.id}:delete-candidate">Delete candidate</button>
      </div>
      ${status === 'unreviewed' ? '<span class="unreviewed-label">Unreviewed</span>' : ''}
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
  document.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => openModal());
  });
  document.querySelectorAll('[data-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [id, value] = btn.dataset.status.split(':');
      const current = getStatus(id);
      setStatus(id, current === value ? 'unreviewed' : value);
      renderAll();
    });
  });
  document.querySelectorAll('[data-retry]').forEach(btn => {
    btn.addEventListener('click', () => {
      showToast('Retry queued — demo mode does not refetch real pages.');
    });
  });
}

function renderBulkBar() {
  const bar = document.getElementById('bulkBar');
  bar.classList.toggle('show', selection.size > 0);
  document.getElementById('bulkCount').textContent = selection.size;
}

// ---------------------------------------------------------------------------
// Bulk actions
// ---------------------------------------------------------------------------
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-bulk]');
  if (!btn) return;
  const value = btn.dataset.bulk;
  const label = { keep: 'Keep', 'read-later': 'Read later', 'delete-candidate': 'Delete candidate' }[value];
  const ids = Array.from(selection);
  if (ids.length === 0) return;
  const ok = confirm(`Mark ${ids.length} bookmark${ids.length === 1 ? '' : 's'} as ${label}?`);
  if (!ok) return;
  lastBulkSnapshot = ids.map(id => ({ id, prev: getStatus(id) }));
  ids.forEach(id => setStatus(id, value));
  selection.clear();
  renderAll();
  showToast(`Marked ${ids.length} bookmark${ids.length === 1 ? '' : 's'} as ${label}.`, {
    actionLabel: 'Undo',
    onAction: () => {
      lastBulkSnapshot.forEach(({ id, prev }) => setStatus(id, prev));
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
    const btn = document.createElement('button');
    btn.textContent = opts.actionLabel;
    btn.addEventListener('click', () => { opts.onAction && opts.onAction(); el.remove(); });
    el.appendChild(btn);
  }
  wrap.appendChild(el);
  setTimeout(() => el.remove(), opts.actionLabel ? 6000 : 3200);
}

// ---------------------------------------------------------------------------
// Modal (fake link click)
// ---------------------------------------------------------------------------
function openModal() { document.getElementById('linkModal').classList.add('show'); }
function closeModal() { document.getElementById('linkModal').classList.remove('show'); }

// ---------------------------------------------------------------------------
// Export (client-side CSV of current visible results)
// ---------------------------------------------------------------------------
function exportCsv() {
  const rows = getVisibleItems().map(it => ({
    title: it.title, url: `https://${it.domain}/`, domain: it.domain, folder: it.folder,
    contentType: it.type, topic: it.topic, freshness: FRESHNESS_LABEL[it.freshness],
    publicationDate: it.pubDate || 'unknown', savedDate: it.savedDate, status: getStatus(it.id)
  }));
  const headers = Object.keys(rows[0] || { title: '', url: '', domain: '', folder: '', contentType: '', topic: '', freshness: '', publicationDate: '', savedDate: '', status: '' });
  const csv = [headers.join(',')].concat(
    rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))
  ).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'bookmark-library-export.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast(`Exported ${rows.length} bookmark${rows.length === 1 ? '' : 's'} as CSV.`);
}

// ---------------------------------------------------------------------------
// Suggested queue
// ---------------------------------------------------------------------------
function enterSuggested() {
  preSuggestState = { filters: cloneFilters(filters), searchQuery, sortKey };
  filters = { status: new Set(), topic: new Set(), type: new Set(), freshness: new Set(), fetch: new Set(), folder: new Set() };
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
function cloneFilters(f) {
  const out = {};
  Object.keys(f).forEach(k => out[k] = new Set(f[k]));
  return out;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------
function renderAll() {
  renderRail();
  renderChips();
  renderList();
}

document.addEventListener('DOMContentLoaded', () => {
  renderAll();

  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderList();
  });

  document.getElementById('sortSelect').addEventListener('change', (e) => {
    sortKey = e.target.value;
    renderList();
  });

  document.getElementById('clearAllFilters').addEventListener('click', () => {
    Object.keys(filters).forEach(k => filters[k].clear());
    searchQuery = '';
    document.getElementById('searchInput').value = '';
    renderAll();
  });
  document.getElementById('emptyReset').addEventListener('click', () => {
    Object.keys(filters).forEach(k => filters[k].clear());
    searchQuery = '';
    document.getElementById('searchInput').value = '';
    if (suggestedMode) exitSuggested(); else renderAll();
  });

  document.getElementById('selectAll').addEventListener('change', (e) => {
    const visible = getVisibleItems();
    if (e.target.checked) visible.forEach(it => selection.add(it.id));
    else visible.forEach(it => selection.delete(it.id));
    renderList();
  });
  document.getElementById('bulkClear').addEventListener('click', () => { selection.clear(); renderList(); });

  document.getElementById('exportBtn').addEventListener('click', exportCsv);

  document.getElementById('suggestedToggle').addEventListener('click', () => {
    if (suggestedMode) exitSuggested(); else enterSuggested();
  });
  document.getElementById('suggestedClose').addEventListener('click', exitSuggested);

  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('linkModal').addEventListener('click', (e) => {
    if (e.target.id === 'linkModal') closeModal();
  });
});

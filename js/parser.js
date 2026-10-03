// ============================================================================
// Netscape Bookmark File (Chrome export) parser + honest, local-only heuristics.
// No network calls. No AI. Every inferred field says so in the UI.
// ============================================================================

function hashString(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

const TRACKING_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'igshid', 'ref_src', 'ref'];

function canonicalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    TRACKING_PARAMS.forEach(p => u.searchParams.delete(p));
    let s = u.toString();
    if (s.endsWith('/') && u.pathname === '/') s = s.slice(0, -1) + '/';
    return s;
  } catch (e) {
    return raw;
  }
}

function isSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return false;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (!host.includes('.')) return false; // bare hostnames — likely intranet
  return true;
}

function decodeEntities(str) {
  const el = document.createElement('textarea');
  el.innerHTML = str;
  return el.value;
}

// Chrome's exported bookmarks HTML is not well-nested markup; browsers'
// DOMParser "corrects" it unpredictably. We tokenize the raw text directly,
// which is what real bookmark-import tools do for this exact format.
function parseBookmarksHtml(html) {
  const items = [];
  let skipped = 0;
  const stack = [];
  const TOKEN_RE = /<H3([^>]*)>([\s\S]*?)<\/H3>|<A\s+([^>]*)>([\s\S]*?)<\/A>|(<DL>)|(<\/DL>)/gi;
  let match;
  while ((match = TOKEN_RE.exec(html)) !== null) {
    if (match[2] !== undefined) {
      // Folder header — remember it; the *next* <DL> opens its children.
      stack.pendingFolder = decodeEntities(match[2].trim());
    } else if (match[4] !== undefined) {
      // Bookmark link
      const attrs = match[3];
      const hrefMatch = /HREF=["']([^"']*)["']/i.exec(attrs);
      const dateMatch = /ADD_DATE=["'](\d+)["']/i.exec(attrs);
      if (!hrefMatch) continue;
      const rawUrl = decodeEntities(hrefMatch[1]);
      if (!isSafeUrl(rawUrl)) { skipped++; continue; }
      const title = decodeEntities(match[4].replace(/<[^>]+>/g, '').trim()) || rawUrl;
      const addDate = dateMatch ? parseInt(dateMatch[1], 10) * 1000 : null;
      items.push({
        title,
        url: rawUrl,
        canonicalUrl: canonicalizeUrl(rawUrl),
        folder: stack.length ? stack.join('/') : 'Uncategorized',
        savedAt: addDate && !isNaN(addDate) ? addDate : null
      });
    } else if (match[5] !== undefined) {
      // <DL> opened — push the folder name that was pending, if any
      if (stack.pendingFolder !== undefined && stack.pendingFolder !== null) {
        stack.push(stack.pendingFolder);
        stack.pendingFolder = null;
      }
    } else if (match[6] !== undefined) {
      if (stack.length) stack.pop();
    }
  }
  return { items, skipped };
}

// ---------------------------------------------------------------------------
// Local heuristics — all clearly derived from the URL/folder/date only.
// No content is fetched. No AI is involved.
// ---------------------------------------------------------------------------

const PDF_EXT = /\.pdf(\?|#|$)/i;
const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv)$/i;
const PODCAST_HOSTS = /(^|\.)(podcasts\.apple\.com|open\.spotify\.com|overcast\.fm|pocketcasts\.com|castbox\.fm)$/i;
const DOC_HOSTS = /(^|\.)(docs\.google\.com|notion\.so|dropbox\.com)$/i;

function guessContentType(url) {
  let host = '';
  try { host = new URL(url).hostname; } catch (e) {}
  if (PDF_EXT.test(url)) return 'Document/PDF';
  if (VIDEO_HOSTS.test(host)) return 'Video';
  if (PODCAST_HOSTS.test(host)) return 'Podcast';
  if (DOC_HOSTS.test(host)) return 'Document/PDF';
  return 'Article';
}

const DAY = 86400000;
function guessFreshness(savedAt) {
  if (!savedAt) return { bucket: 'unknown', label: 'Save date unknown' };
  const age = Date.now() - savedAt;
  if (age < 30 * DAY) return { bucket: 'new', label: 'Saved this month' };
  if (age < 365 * DAY) return { bucket: 'this-year', label: 'Saved this year' };
  if (age < 2 * 365 * DAY) return { bucket: 'last-year', label: 'Saved 1–2 years ago' };
  return { bucket: 'old', label: 'Saved 2+ years ago' };
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
}

const CHROME_ROOT_FOLDERS = new Set(['bookmarks bar', 'other bookmarks', 'mobile bookmarks', 'bookmarks']);

// Chrome always nests real bookmarks under a root container ("Bookmarks
// bar", "Other bookmarks", …) — that root is nearly always the same for
// every bookmark, so it's useless as a filter. Skip past it to the first
// folder the person actually created.
function topFolder(folder) {
  const segments = folder.split('/').filter(Boolean);
  if (segments.length === 0) return 'Uncategorized';
  if (segments.length > 1 && CHROME_ROOT_FOLDERS.has(segments[0].toLowerCase())) {
    return segments[1];
  }
  return segments[0];
}

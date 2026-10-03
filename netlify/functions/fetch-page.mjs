// ============================================================================
// Free Netlify Function: fetches ONE page server-side (to get past browser
// CORS) and returns just enough text for local, free keyword clustering.
// No AI call here, no API key, no storage — one URL in, plain text out.
// ============================================================================

const TIMEOUT_MS = 8000;
const MAX_BYTES = 600_000; // cap how much of a page we read
const MAX_CONTENT_LENGTH = 5_000_000; // reject anything advertising more than this up front

const ENTITY_MAP = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  mdash: '—', ndash: '–', hellip: '…', trade: '™',
  copy: '©', reg: '®', deg: '°', eacute: 'é', egrave: 'è'
};
function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITY_MAP[name] !== undefined ? ENTITY_MAP[name] : ' ');
}

function isSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return false;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (!host.includes('.')) return false;
  return true;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

export default async (req) => {
  let target;
  try {
    target = new URL(req.url).searchParams.get('url');
  } catch (e) {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }
  if (!target || !isSafeUrl(target)) {
    return json({ ok: false, reason: 'invalid_or_blocked_url' }, 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'BookmarkLibraryFetchBot/1.0 (+https://bookmark-library.netlify.app; personal bookmark triage tool, fetched at the owner\'s own request)'
      }
    });

    if (!res.ok) return json({ ok: false, reason: 'http_error', status: res.status });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return json({ ok: false, reason: 'not_html', status: res.status });

    const declaredLength = parseInt(res.headers.get('content-length') || '0', 10);
    if (declaredLength && declaredLength > MAX_CONTENT_LENGTH) {
      return json({ ok: false, reason: 'too_large' });
    }

    const reader = res.body.getReader();
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      chunks.push(value);
      if (received > MAX_BYTES) { try { controller.abort(); } catch (e) {} break; }
    }
    clearTimeout(timer);

    const html = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf-8');
    const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim().slice(0, 300);
    const description = decodeEntities((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1] || '').trim().slice(0, 500);

    // Prefer <article>/<main> so nav, footers and cookie-banner boilerplate
    // (shared verbatim across unrelated sites) don't pollute the keywords.
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(nav|footer|header)[\s\S]*?<\/\1>/gi, ' ');
    const mainMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i) || cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    const contentHtml = mainMatch ? mainMatch[1] : cleaned;
    const text = decodeEntities(contentHtml.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 4000);

    return json({ ok: true, title, description, text, status: res.status });
  } catch (e) {
    clearTimeout(timer);
    const reason = e.name === 'AbortError' ? 'timeout' : 'network_error';
    return json({ ok: false, reason });
  }
};

export const config = { path: '/api/fetch-page' };

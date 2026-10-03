// ============================================================================
// Local, free keyword clustering — TF-IDF + greedy cosine-similarity grouping.
// No AI model, no network call here (fetching happens separately). Runs
// entirely in the browser over whatever page text was fetched.
// ============================================================================

const STOPWORDS = new Set(('a about above after again against all am an and any are aren as at be because been '
  + 'before being below between both but by can cannot could did do does doing down during each few for from further '
  + 'had has have having he her here hers herself him himself his how i if in into is it its itself just like me more '
  + 'most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so '
  + 'some such than that the their theirs them themselves then there these they this those through to too under until '
  + 'up very was we were what when where which while who whom why will with you your yours yourself yourselves also '
  + 'will would com www http https html new get one two first said says say make made us using use used via into '
  + 'article post read more page site home blog news today year years time way back top best guide list things '
  + 'cookie cookies consent enable enabled enabling necessary essential preferences settings privacy policy accept '
  + 'subscribe subscription subscriber newsletter sign signin signup login log account browser javascript please '
  + 'continue click here menu skip content main search share follow terms service copyright rights reserved true false '
  + 'app web desktop mobile listen watch open browser notification notifications substack youtube channel playlist '
  + 'transcript comment comments subscriber subscribers views like liked saved save download install update'
).split(' '));

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && w.length < 24 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

// docs: [{ id, text }]. Returns Map(id -> { terms: [{term,weight}] })
function computeTfidf(docs, topN) {
  const docTokens = docs.map(d => tokenize(d.text));
  const df = new Map();
  docTokens.forEach(tokens => {
    new Set(tokens).forEach(t => df.set(t, (df.get(t) || 0) + 1));
  });
  const N = docs.length;
  const vectors = new Map();
  docs.forEach((d, i) => {
    const tokens = docTokens[i];
    if (tokens.length === 0) { vectors.set(d.id, []); return; }
    const tf = new Map();
    tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));
    const scored = Array.from(tf.entries()).map(([term, count]) => {
      const idf = Math.log((N + 1) / (df.get(term) + 1)) + 1;
      return { term, weight: (count / tokens.length) * idf };
    });
    scored.sort((a, b) => b.weight - a.weight);
    vectors.set(d.id, scored.slice(0, topN || 10));
  });
  return vectors;
}

function cosineSim(a, b) {
  if (!a.length || !b.length) return 0;
  const bMap = new Map(b.map(x => [x.term, x.weight]));
  let dot = 0;
  a.forEach(x => { if (bMap.has(x.term)) dot += x.weight * bMap.get(x.term); });
  const normA = Math.sqrt(a.reduce((s, x) => s + x.weight * x.weight, 0));
  const normB = Math.sqrt(b.reduce((s, x) => s + x.weight * x.weight, 0));
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}

function titleCase(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

// docs: [{ id, text }] -> Map(id -> topicLabel)
function clusterDocuments(docs, opts) {
  opts = opts || {};
  const threshold = opts.threshold || 0.12;
  const minClusterSize = opts.minClusterSize || 3;
  const vectors = computeTfidf(docs, 10);

  const informativeness = (id) => (vectors.get(id) || []).reduce((s, x) => s + x.weight, 0);
  const order = docs.map(d => d.id).sort((a, b) => informativeness(b) - informativeness(a));

  const assigned = new Set();
  const clusters = []; // { seedId, memberIds: [] }

  order.forEach(seedId => {
    if (assigned.has(seedId)) return;
    const seedVec = vectors.get(seedId);
    if (!seedVec || seedVec.length === 0) return;
    const members = [seedId];
    assigned.add(seedId);
    order.forEach(otherId => {
      if (assigned.has(otherId) || otherId === seedId) return;
      const sim = cosineSim(seedVec, vectors.get(otherId) || []);
      if (sim >= threshold) { members.push(otherId); assigned.add(otherId); }
    });
    clusters.push({ seedId, memberIds: members });
  });

  const result = new Map();
  clusters.forEach(c => {
    if (c.memberIds.length < minClusterSize) {
      c.memberIds.forEach(id => result.set(id, 'Unclustered'));
      return;
    }
    // Label = top shared terms across the cluster's own TF-IDF vectors
    const termTotals = new Map();
    c.memberIds.forEach(id => {
      (vectors.get(id) || []).forEach(({ term, weight }) => termTotals.set(term, (termTotals.get(term) || 0) + weight));
    });
    const topTerms = Array.from(termTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2).map(t => t[0]);
    const label = topTerms.length ? titleCase(topTerms.join(' / ')) : 'Unclustered';
    c.memberIds.forEach(id => result.set(id, label));
  });

  docs.forEach(d => { if (!result.has(d.id)) result.set(d.id, 'Unclustered'); });
  return result;
}

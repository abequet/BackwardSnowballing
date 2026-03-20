// ═══════════════════════════════════════════════
//  api.js — API interactions (Crossref, OpenAlex, Semantic Scholar)
// ═══════════════════════════════════════════════

async function fetchFromAPIs(doi) {
  let crRefs = [], oaRefs = [], s2Refs = [];

  // 1) Crossref
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    if (r.ok) {
      const d = await r.json(), items = d.message?.reference || [];
      if (items.length) crRefs = items.map(x => ({
        title: x['article-title'] || x.unstructured || 'Untitled',
        doi: x.DOI || null, authors: x.author || '', year: x.year || null, _src: 'crossref'
      }));
    }
  } catch (e) {}

  // 2) OpenAlex
  try {
    const r = await fetch(`https://api.openalex.org/works/doi:${doi}`);
    if (r.ok) {
      const d = await r.json();
      if (d.referenced_works?.length) {
        const ids = d.referenced_works; let works = [];
        for (let i = 0; i < ids.length; i += 50) {
          const batch = ids.slice(i, i + 50);
          try {
            const br = await fetch(`https://api.openalex.org/works?filter=ids.openalex:${batch.map(x => x.replace('https://openalex.org/', '')).join('|')}&per_page=50`);
            if (br.ok) { const bd = await br.json(); works.push(...(bd.results || [])); }
          } catch (e) {}
        }
        if (works.length) oaRefs = works.map(w => ({
          title: w.title || 'Untitled',
          doi: w.doi ? w.doi.replace('https://doi.org/', '') : null,
          authors: (w.authorships || []).map(a => a.author?.display_name).filter(Boolean).join(', '),
          year: w.publication_year || null, _src: 'openalex'
        }));
      }
    }
  } catch (e) {}

  // 3) Semantic Scholar
  try {
    const r = await fetch(`https://api.semanticscholar.org/graph/v1/paper/DOI:${doi}?fields=references.title,references.externalIds,references.authors,references.year`);
    if (r.ok) {
      const d = await r.json(), items = d.references || [];
      if (items.length) s2Refs = items.map(x => ({
        title: x.title || 'Untitled',
        doi: x.externalIds?.DOI || null,
        authors: (x.authors || []).map(a => a.name).join(', '),
        year: x.year || null, _src: 's2'
      }));
    }
  } catch (e) {}

  // Pick best source, supplement with unique refs from others
  const candidates = [{ refs: crRefs }, { refs: oaRefs }, { refs: s2Refs }]
    .filter(c => c.refs.length).sort((a, b) => b.refs.length - a.refs.length);
  if (!candidates.length) return [];
  let refs = [...candidates[0].refs];
  for (let i = 1; i < candidates.length; i++) {
    for (const o of candidates[i].refs) {
      const on = normalizeForDedup(o.title);
      if (!refs.some(r => stringSimilarity(normalizeForDedup(r.title), on) > 0.70) && o.title !== 'Untitled')
        refs.push(o);
    }
  }
  return deduplicateRefs(refs);
}

// ── Article metadata for the info card ──
async function fetchArticleInfo(doi) {
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    if (r.ok) {
      const d = await r.json(), msg = d.message;
      return {
        title: (msg.title || [])[0] || '',
        authors: (msg.author || []).map(a => [a.given, a.family].filter(Boolean).join(' ')).join(', '),
        year: msg.published?.['date-parts']?.[0]?.[0] || (msg['published-print'] || msg['published-online'])?.['date-parts']?.[0]?.[0] || '',
        journal: (msg['container-title'] || [])[0] || '',
        doi
      };
    }
  } catch (e) {}
  try {
    const r = await fetch(`https://api.openalex.org/works/doi:${doi}`);
    if (r.ok) {
      const d = await r.json();
      return {
        title: d.title || '',
        authors: (d.authorships || []).map(a => a.author?.display_name).filter(Boolean).join(', '),
        year: d.publication_year || '',
        journal: d.primary_location?.source?.display_name || '',
        doi
      };
    }
  } catch (e) {}
  return { title: '', authors: '', year: '', journal: '', doi };
}

// ── DOI enrichment for refs missing a DOI ──
async function enrichRefsWithDOIs(refs) {
  const toResolve = refs.filter(r => !r.doi);
  const bs = 5;
  for (let i = 0; i < toResolve.length; i += bs) {
    await Promise.all(toResolve.slice(i, i + bs).map(r => resolveOneDOI(r)));
    renderList(refs);
    if (i + bs < toResolve.length) await new Promise(r => setTimeout(r, 350));
  }
}

async function resolveOneDOI(ref) {
  try {
    let query = ref.title.slice(0, 120);
    const firstAuthor = (ref.authors || '').split(',')[0].trim();
    if (firstAuthor && firstAuthor.length > 2) query = firstAuthor + ' ' + query;
    const r = await fetch(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&rows=5&select=DOI,title,author,published-print,published-online`);
    if (!r.ok) return;
    const d = await r.json(); const items = d.message?.items || []; if (!items.length) return;
    const refNorm = normalizeForDedup(ref.title); let best = null, bestS = 0;
    for (const item of items) {
      const iNorm = normalizeForDedup(item.title?.[0] || '');
      let sc = stringSimilarity(refNorm, iNorm);
      if (ref.year) {
        const dp = item['published-print'] || item['published-online'];
        if (String(dp?.['date-parts']?.[0]?.[0]) === ref.year) sc += 0.1;
      }
      if (firstAuthor && item.author?.length) {
        if (normalizeForDedup(firstAuthor).includes(normalizeForDedup(item.author[0].family || ''))) sc += 0.1;
      }
      if (sc > bestS) { bestS = sc; best = item; }
    }
    if (best && bestS > 0.55) {
      ref.doi = best.DOI;
      if ((!ref.authors || ref.authors.length < 3) && best.author)
        ref.authors = best.author.map(a => [a.family, a.given].filter(Boolean).join(', ')).join('; ');
      if (best.title?.[0] && bestS > 0.65) ref.title = best.title[0];
      if (!ref.year) {
        const dp = best['published-print'] || best['published-online'];
        if (dp?.['date-parts']?.[0]?.[0]) ref.year = String(dp['date-parts'][0][0]);
      }
    }
  } catch (e) {}
}

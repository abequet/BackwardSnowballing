// ═══════════════════════════════════════════════
//  api.js — API interactions (Crossref, OpenAlex, Semantic Scholar)
// ═══════════════════════════════════════════════

async function fetchFromAPIs(doi) {
  let crRefs = [], oaRefs = [], s2Refs = [];

  // 1) Crossref
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=snowball-tool@example.org`);
    if (r.ok) {
      const d = await r.json(), items = d.message?.reference || [];
      if (items.length) crRefs = items.map(x => {
        let title = x['article-title'] || '';
        let authors = x.author || '';
        let year = x.year || null;
        // If no article-title, parse unstructured citation string
        if (!title && x.unstructured) {
          const parsed = parseUnstructuredRef(x.unstructured);
          title = parsed.title || x.unstructured;
          if (!authors) authors = parsed.authors;
          if (!year) year = parsed.year;
        }
        return { title: title || 'Untitled', doi: x.DOI || null, authors, year, _src: 'crossref' };
      });
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
      if (o.title === 'Untitled') continue;
      // Check DOI-based duplicate first (strongest signal)
      if (o.doi && refs.some(r => r.doi && r.doi.toLowerCase() === o.doi.toLowerCase())) continue;
      // Then title similarity
      const on = normalizeForDedup(o.title);
      if (refs.some(r => stringSimilarity(normalizeForDedup(r.title), on) > 0.65)) continue;
      refs.push(o);
    }
  }
  return deduplicateRefs(refs);
}

// ── Article metadata for the info card ──
async function fetchArticleInfo(doi) {
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=snowball-tool@example.org`);
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

// ── Forward citation chasing: who cites this article? ──
async function fetchCitingArticles(doi) {
  let oaCiting = [], s2Citing = [];

  // 1) OpenAlex — use cited_by filter
  try {
    const r = await fetch(`https://api.openalex.org/works/doi:${doi}`);
    if (r.ok) {
      const d = await r.json();
      const oaId = d.id?.replace('https://openalex.org/', '');
      if (oaId) {
        // Fetch citing works in batches (OpenAlex max 200 per page)
        let page = 1, hasMore = true;
        while (hasMore && page <= 5) { // cap at 1000 citing articles
          const cr = await fetch(`https://api.openalex.org/works?filter=cites:${oaId}&per_page=200&page=${page}&select=id,doi,title,authorships,publication_year`);
          if (cr.ok) {
            const cd = await cr.json();
            const results = cd.results || [];
            oaCiting.push(...results.map(w => ({
              title: w.title || 'Untitled',
              doi: w.doi ? w.doi.replace('https://doi.org/', '') : null,
              authors: (w.authorships || []).map(a => a.author?.display_name).filter(Boolean).join(', '),
              year: w.publication_year || null,
              _src: 'openalex'
            })));
            hasMore = results.length === 200;
            page++;
          } else { hasMore = false; }
        }
      }
    }
  } catch (e) {}

  // 2) Semantic Scholar — /citations endpoint
  try {
    const r = await fetch(`https://api.semanticscholar.org/graph/v1/paper/DOI:${doi}?fields=citations.title,citations.externalIds,citations.authors,citations.year`);
    if (r.ok) {
      const d = await r.json(), items = d.citations || [];
      if (items.length) s2Citing = items.filter(x => x.title).map(x => ({
        title: x.title || 'Untitled',
        doi: x.externalIds?.DOI || null,
        authors: (x.authors || []).map(a => a.name).join(', '),
        year: x.year || null,
        _src: 's2'
      }));
    }
  } catch (e) {}

  // Merge: pick largest, supplement from the other
  let refs;
  if (oaCiting.length >= s2Citing.length) {
    refs = [...oaCiting];
    for (const s of s2Citing) {
      const sn = normalizeForDedup(s.title);
      if (!refs.some(r => stringSimilarity(normalizeForDedup(r.title), sn) > 0.70) && s.title !== 'Untitled')
        refs.push(s);
    }
  } else {
    refs = [...s2Citing];
    for (const o of oaCiting) {
      const on = normalizeForDedup(o.title);
      if (!refs.some(r => stringSimilarity(normalizeForDedup(r.title), on) > 0.70) && o.title !== 'Untitled')
        refs.push(o);
    }
  }

  return deduplicateRefs(refs);
}
async function enrichRefsWithDOIs(refs) {
  const toResolve = refs.filter(r => !r.doi);
  // Process 3 at a time with longer delays to avoid Crossref 429
  const bs = 3;
  for (let i = 0; i < toResolve.length; i += bs) {
    await Promise.all(toResolve.slice(i, i + bs).map(r => resolveOneDOI(r)));
    // Safe render — only if the list element still exists
    const list = document.getElementById('refList');
    if (list) renderList(refs);
    if (i + bs < toResolve.length) await new Promise(r => setTimeout(r, 800));
  }
}

async function resolveOneDOI(ref) {
  try {
    let query = ref.title.slice(0, 120);
    const firstAuthor = (ref.authors || '').split(',')[0].trim();
    if (firstAuthor && firstAuthor.length > 2) query = firstAuthor + ' ' + query;
    // Include mailto for Crossref polite pool (higher rate limits)
    const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&rows=5&select=DOI,title,author,published-print,published-online&mailto=snowball-tool@example.org`;
    const r = await fetch(url);
    if (r.status === 429) {
      // Rate limited — wait and retry once
      await new Promise(res => setTimeout(res, 2000));
      const retry = await fetch(url);
      if (!retry.ok) return;
      const d = await retry.json(); return matchAndEnrich(ref, d, firstAuthor);
    }
    if (!r.ok) return;
    const d = await r.json();
    matchAndEnrich(ref, d, firstAuthor);
  } catch (e) {}
}

function matchAndEnrich(ref, d, firstAuthor) {
  const items = d.message?.items || []; if (!items.length) return;
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
}

// ── Parse unstructured citation string from Crossref ──
// Format typically: "Authors (Year) Title. Journal vol:pages" or "Authors. Title. Journal year;vol:pages"
function parseUnstructuredRef(raw) {
  const clean = raw.replace(/\s+/g, ' ').trim();
  let authors = '', title = '', year = null;

  // Extract year
  const yearParenMatch = clean.match(/\((\d{4})\)/);
  const yearPlainMatch = clean.match(/(?:[\s,])(\d{4})(?=[;:,.\s]|$)/);
  year = yearParenMatch ? yearParenMatch[1] : yearPlainMatch ? yearPlainMatch[1] : null;

  // Try Vancouver format: "Authors (year) Title. Journal..."
  if (year) {
    const yearParen = clean.indexOf('(' + year + ')');
    const yearIdx = yearParen >= 0 ? yearParen : clean.indexOf(year);
    authors = clean.slice(0, yearIdx).trim().replace(/[,()\s]+$/, '');
    const afterYearStart = yearParen >= 0 ? yearParen + year.length + 2 : yearIdx + year.length;
    const afterYear = clean.slice(afterYearStart).replace(/^[).:\s]+/, '').trim();
    // Title: up to first period followed by a capital letter (journal name) or end
    const titleMatch = afterYear.match(/^(.+?)\.(?:\s+[A-Z]|\s*$)/);
    title = titleMatch ? titleMatch[1] : afterYear.split(/\.\s/)[0];
  } else {
    // No year: split on periods
    const parts = clean.split(/\.\s+/);
    if (parts.length >= 2) { authors = parts[0]; title = parts[1]; }
    else title = clean;
  }

  title = (title || '').trim().replace(/^[""\u201c]+|[""\u201d]+$/g, '');
  authors = (authors || '').trim();
  return { title, authors, year };
}

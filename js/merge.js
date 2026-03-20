// ═══════════════════════════════════════════════
//  merge.js — Cross-check & merge PDF + API ref sets
// ═══════════════════════════════════════════════

function mergeRefSets(pdfRefs, apiRefs) {
  if (!pdfRefs.length) return deduplicateRefs(apiRefs);
  if (!apiRefs.length) return deduplicateRefs(pdfRefs);

  // Start with API refs (usually better metadata)
  let merged = [...apiRefs.map(r => ({ ...r, _src: 'api' }))];

  // Add PDF-only refs that are NOT in the API set
  for (const pr of pdfRefs) {
    const prNorm = normalizeForDedup(pr.title);
    const match = merged.find(r => stringSimilarity(normalizeForDedup(r.title), prNorm) > 0.55);
    if (!match) {
      merged.push({ ...pr, _src: 'pdf-only' });
    } else {
      // Enrich: fill in missing metadata from PDF
      if (!match.authors && pr.authors) match.authors = pr.authors;
      if (!match.year && pr.year) match.year = pr.year;
    }
  }

  return deduplicateRefs(merged);
}

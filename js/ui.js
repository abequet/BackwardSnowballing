// ═══════════════════════════════════════════════
//  ui.js — Rendering, filtering, export
// ═══════════════════════════════════════════════

function showArticleCard(info) {
  const card = document.getElementById('articleCard');
  document.getElementById('articleTitle').textContent = info.title || 'Unknown title';
  let metaParts = [];
  if (info.authors) metaParts.push(esc(info.authors));
  if (info.year) metaParts.push(info.year);
  if (info.journal) metaParts.push('<em>' + esc(info.journal) + '</em>');
  if (info.doi) metaParts.push('<a href="https://doi.org/' + esc(info.doi) + '" target="_blank" rel="noopener">' + esc(info.doi) + '</a>');
  document.getElementById('articleMeta').innerHTML = metaParts.join(' · ');
  card.style.display = 'block';
}

function renderResults(refs) {
  document.getElementById('results').innerHTML = `<div class="results">
    <div class="results-header"><h2>Cited References</h2><span class="badge">${refs.length} ref${refs.length > 1 ? 's' : ''}</span></div>
    <div class="toolbar">
      <input type="text" class="search-box" id="searchBox" placeholder="Filter references…" oninput="filterRefs()">
      <button class="btn-sm" onclick="exportCSV()">⬇ CSV</button>
      <button class="btn-sm" onclick="copyAll()">⎘ Copy DOIs</button>
    </div>
    <ul class="ref-list" id="refList"></ul></div>`;
  renderList(refs);
}

function renderList(refs) {
  const l = document.getElementById('refList');
  if (!refs.length) { l.innerHTML = '<li class="no-results">No results found.</li>'; return; }
  l.innerHTML = refs.map((r, i) => {
    const doiHtml = r.doi
      ? `<span class="ref-doi"><a href="https://doi.org/${esc(r.doi)}" target="_blank" rel="noopener">${esc(r.doi)}</a></span>`
      : '<span class="ref-doi" style="color:var(--text-dim);font-family:var(--mono);font-size:.75rem">no DOI</span>';
    return `<li class="ref-item"><span class="ref-num">${i + 1}</span><div class="ref-body">
      <div class="ref-title">${esc(r.title)}</div><div class="ref-meta">
      ${r.year ? `<span class="ref-year">${r.year}</span>` : ''}
      ${r.authors ? `<span class="ref-authors">${esc(r.authors)}</span>` : ''}
      ${doiHtml}
      </div></div></li>`;
  }).join('');
}

function filterRefs() {
  const q = document.getElementById('searchBox').value.toLowerCase();
  renderList(allRefs.filter(r =>
    (r.title || '').toLowerCase().includes(q) ||
    (r.doi || '').toLowerCase().includes(q) ||
    (r.authors || '').toLowerCase().includes(q) ||
    (r.year || '').toString().includes(q)
  ));
}

function exportCSV() {
  const h = 'Number,Title,DOI,Authors,Year';
  const rows = allRefs.map((r, i) =>
    `${i + 1},"${(r.title || '').replace(/"/g, '""')}","${r.doi || ''}","${(r.authors || '').replace(/"/g, '""')}","${r.year || ''}"`
  );
  const b = new Blob(['\ufeff' + h + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'references_snowball.csv';
  a.click();
  showToast('CSV downloaded');
}

function copyAll() {
  const d = allRefs.filter(r => r.doi).map(r => r.doi).join('\n');
  navigator.clipboard.writeText(d).then(() =>
    showToast(`${allRefs.filter(r => r.doi).length} DOIs copied`)
  );
}

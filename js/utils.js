// ═══════════════════════════════════════════════
//  utils.js — Shared utilities
// ═══════════════════════════════════════════════

function cleanDOI(r) {
  let d = r.trim();
  d = d.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  d = d.replace(/^doi:\s*/i, '');
  return d;
}

function esc(s) {
  return s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
}

function setStatus(t, m) {
  // Target the right status div depending on active mode
  const batchPanel = document.getElementById('panelBatch');
  const isBatch = batchPanel && batchPanel.classList.contains('active');
  const e = document.getElementById(isBatch ? 'batchStatus' : 'status');
  e.className = 'status ' + t;
  e.innerHTML = (t === 'loading' ? '<div class="spinner"></div>' : '') + `<span>${m}</span>`;
}

function showToast(m) {
  const t = document.getElementById('toast');
  t.textContent = m;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function normalizeForDedup(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Dice bigram similarity
function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigrams = s => {
    const bg = new Set();
    for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
    return bg;
  };
  const aBg = bigrams(a), bBg = bigrams(b);
  let inter = 0;
  for (const bg of aBg) if (bBg.has(bg)) inter++;
  return (2 * inter) / (aBg.size + bBg.size);
}

function deduplicateRefs(refs) {
  const seen = [];
  return refs.filter(r => {
    const norm = normalizeForDedup(r.title);
    if (norm.length < 8) return true;
    for (const s of seen) { if (stringSimilarity(norm, s) > 0.70) return false; }
    seen.push(norm);
    return true;
  });
}

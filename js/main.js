// ═══════════════════════════════════════════════
//  main.js — App init, UI wiring, extraction pipeline
// ═══════════════════════════════════════════════

let allRefs = [];
let pendingPDFFile = null;

// ── DOM refs ──
const dz = document.getElementById('dropzone');
const pdfInput = document.getElementById('pdfFile');
const doiField = document.getElementById('doiInput');

// ── Events ──
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dragover'); if (e.dataTransfer.files.length) setPDFFile(e.dataTransfer.files[0]); });
pdfInput.addEventListener('change', () => { if (pdfInput.files.length) setPDFFile(pdfInput.files[0]); });
doiField.addEventListener('keydown', e => { if (e.key === 'Enter') runExtraction(); });
doiField.addEventListener('input', () => { resetPreviousResults(); });
doiField.addEventListener('paste', () => { setTimeout(() => { clearPDF(); resetPreviousResults(); }, 0); });

// ── Input management ──
function setPDFFile(file) {
  if (!file || file.type !== 'application/pdf') { setStatus('error', 'Please provide a valid PDF file.'); return; }
  pendingPDFFile = file;
  document.getElementById('pdfFilename').textContent = file.name;
  resetPreviousResults();
}

function clearPDF() {
  pendingPDFFile = null;
  document.getElementById('pdfFilename').textContent = '';
  pdfInput.value = '';
}

function resetPreviousResults() {
  document.getElementById('results').innerHTML = '';
  document.getElementById('articleCard').style.display = 'none';
  document.getElementById('status').className = 'status';
  allRefs = [];
}

// ═══════════════════════════════════════════════
//  Main extraction pipeline
// ═══════════════════════════════════════════════
async function runExtraction() {
  const doiRaw = doiField.value;
  let doi = cleanDOI(doiRaw);
  const hasPDF = !!pendingPDFFile;
  if (!doi && !hasPDF) { setStatus('error', 'Please provide a DOI, a PDF, or both.'); return; }

  document.getElementById('results').innerHTML = '';
  document.getElementById('articleCard').style.display = 'none';
  let apiRefs = [], pdfRefs = [], pdfDOI = null, pdfFirstPageText = '';

  // ── Step 1: PDF ──
  if (hasPDF) {
    setStatus('loading', 'Step 1/3 — Extracting references from PDF…');
    try {
      const result = await extractFromPDF(pendingPDFFile);
      pdfRefs = result.refs;
      pdfDOI = result.doi;
      pdfFirstPageText = result.firstPageText || '';
      if (!doi && pdfDOI) { doi = pdfDOI; doiField.value = doi; }
    } catch (e) { console.error(e); }
  }

  // ── Article info card ──
  if (doi) {
    setStatus('loading', 'Fetching article metadata…');
    const info = await fetchArticleInfo(doi);
    if (info.title) showArticleCard(info);
  } else if (pdfFirstPageText) {
    const info = extractArticleInfoFromPDFText(pdfFirstPageText);
    if (info.title) showArticleCard(info);
  }

  // ── Step 2: APIs ──
  if (doi) {
    setStatus('loading', `Step 2/3 — Querying APIs for DOI ${doi}…`);
    apiRefs = await fetchFromAPIs(doi);
  }

  // ── Step 3: Cross-check & merge ──
  setStatus('loading', 'Step 3/3 — Cross-checking and merging results…');
  const merged = mergeRefSets(pdfRefs, apiRefs);

  if (merged.length) {
    allRefs = merged;
    renderResults(merged);

    const noDoi = merged.filter(r => !r.doi).length;
    if (noDoi > 0) {
      setStatus('loading', `Resolving DOIs for ${noDoi} references via Crossref…`);
      await enrichRefsWithDOIs(merged);
      allRefs = merged;
      renderList(merged);
    }

    const withDoi = merged.filter(r => r.doi).length;
    const sources = [];
    if (pdfRefs.length) sources.push(`PDF: ${pdfRefs.length}`);
    if (apiRefs.length) sources.push(`API: ${apiRefs.length}`);
    setStatus('success',
      `${merged.length} unique references found. ${withDoi} with DOI. ` +
      `<span class="source-badge">${sources.join(' · ')} → merged</span>`);
  } else {
    setStatus('warn', 'No references found. Check the DOI or try a different PDF.');
  }
}

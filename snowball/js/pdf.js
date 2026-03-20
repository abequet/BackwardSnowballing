// ═══════════════════════════════════════════════
//  pdf.js — PDF text extraction & reference parsing
// ═══════════════════════════════════════════════

async function extractFromPDF(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  let foundDOI = null;
  let pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const vp = page.getViewport({ scale: 1 });
    const pageWidth = vp.width, pageMid = pageWidth / 2;
    const items = tc.items.filter(it => it.str.trim()).map(it => ({
      x: it.transform[4], y: Math.round(it.transform[5]), text: it.str
    }));

    // Extract DOI from first page
    if (i === 1) {
      const allText = items.map(it => it.text).join(' ');
      const dm = allText.match(/\b(10\.\d{4,9}\/[^\s,;]+)/);
      if (dm) foundDOI = dm[1].replace(/[.,;)\]}']+$/, '');
    }

    // Two-column detection
    const leftItems = items.filter(it => it.x < pageMid - 20);
    const rightItems = items.filter(it => it.x >= pageMid - 20);
    const isTwoCol = leftItems.length > 5 && rightItems.length > 5
      && Math.min(leftItems.length, rightItems.length) / Math.max(leftItems.length, rightItems.length) > 0.25;

    if (isTwoCol) {
      pages.push(buildLines(leftItems).join('\n') + '\n' + buildLines(rightItems).join('\n'));
    } else {
      pages.push(buildLines(items).join('\n'));
    }
  }

  const fullText = pages.join('\n\n');
  const refs = extractRefsFromPDF(fullText);
  return { refs, doi: foundDOI, firstPageText: pages[0] || '' };
}

function buildLines(col) {
  const yg = new Map();
  for (const it of col) {
    const yk = Math.round(it.y / 2) * 2;
    if (!yg.has(yk)) yg.set(yk, []);
    yg.get(yk).push(it);
  }
  return [...yg.keys()].sort((a, b) => b - a).map(y =>
    yg.get(y).sort((a, b) => a.x - b.x).map(it => it.text).join(' ')
  );
}

// ── Reference section finder & dispatcher ──
function extractRefsFromPDF(text) {
  const headingRe = /(?:^|\n)\s*(References|REFERENCES|Bibliography|BIBLIOGRAPHY|Références|Works Cited|Literature Cited)\s*(?:\n|$)/gm;
  let refStart = -1, m;
  while ((m = headingRe.exec(text)) !== null) refStart = m.index + m[0].length;
  if (refStart < 0) refStart = Math.floor(text.length * 0.7);

  let refText = text.slice(refStart);
  const endRe = /\n\s*(Appendix|APPENDIX|Supplementary|Author Bio|Acknowledgements?|ACKNOWLEDGEMENTS?)\b/i;
  const endM = endRe.exec(refText);
  if (endM) refText = refText.slice(0, endM.index);

  // Try both strategies, pick best
  const numberedEntries = splitNumbered(refText);
  const apaEntries = splitAPA(refText);
  let entries;
  if (numberedEntries.length >= apaEntries.length && numberedEntries.length >= 3) entries = numberedEntries;
  else if (apaEntries.length >= 3) entries = apaEntries;
  else entries = numberedEntries.length > apaEntries.length ? numberedEntries : apaEntries;

  // Parse & clean
  let parsed = entries.map(parseOneRef).filter(r => r && r.title.length > 5);
  parsed = parsed.filter(r => {
    if (/^(Appl Psychophysiol|Springer|Prehospital and Disaster|February \d{4}|Vol\.\s|1\s+3)/.test(r.title)) return false;
    if (r.title.split(/\s+/).length < 3 && !r.doi && !r.year) return false;
    if (r._raw && r._raw.length < 25) return false;
    return true;
  });
  return deduplicateRefs(parsed);
}

// ── Numbered refs: [1], 1., (1) ──
function splitNumbered(refText) {
  const entries = [];
  const refStartRe = /(?:^|\n)\s*(?:\[?\d{1,3}\]?[\.\):]|\(\d{1,3}\))\s+/g;
  const matches = []; let match;
  while ((match = refStartRe.exec(refText)) !== null)
    matches.push({ index: match.index, end: match.index + match[0].length });
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].end;
    const end = i + 1 < matches.length ? matches[i + 1].index : refText.length;
    const entry = refText.slice(start, end).replace(/\s+/g, ' ').trim();
    if (entry.length > 20) entries.push(entry);
  }
  return entries;
}

// ── APA author-year ──
function splitAPA(refText) {
  const lines = refText.split('\n');
  const entries = []; let current = '';
  for (const line of lines) {
    const trimmed = line.trim(); if (!trimmed) continue;
    const looksLikeNewRef = isAPARefStart(trimmed, lines, lines.indexOf(line));
    if (looksLikeNewRef && current.length > 30) { entries.push(current.trim()); current = trimmed; }
    else {
      if (current.endsWith('-') && /^[a-zà-ü]/.test(trimmed)) current = current.slice(0, -1) + trimmed;
      else current += (current ? ' ' : '') + trimmed;
    }
  }
  if (current.length > 20) entries.push(current.trim());
  return entries.map(e => e.replace(/\s+/g, ' '));
}

function isAPARefStart(line, allLines, idx) {
  const authorRe = /^(?:(?:van\s+(?:der\s+)?|de\s+|Le\s+|Di\s+|Del\s+)?(?:Mc|Mac|O')?[A-ZÀ-Ü][a-zà-ü''-]+(?:[-][A-ZÀ-Ü][a-zà-ü]+)?,\s*[A-ZÀ-Ü][\.\w]|(?:Association|Critical)\s)/;
  if (!authorRe.test(line)) return false;
  let lookahead = line;
  for (let j = 1; j <= 4 && idx + j < allLines.length; j++) lookahead += ' ' + allLines[idx + j].trim();
  return /\((?:19|20)\d{2}[a-z]?\)/.test(lookahead);
}

// ── Single reference parser (APA + Vancouver) ──
function parseOneRef(raw) {
  const clean = raw.replace(/\s+/g, ' ').trim();
  const stripped = clean.replace(/^(?:\[\d{1,3}\]|\(\d{1,3}\)|\d{1,3}[\.\):])\s*/, '');
  const doiMatch = stripped.match(/10\.\d{4,9}\/[^\s,;}\]\)]+/);
  let doi = doiMatch ? doiMatch[0].replace(/[.,;)\]}']+$/, '') : null;

  const isVancouver = /^[A-ZÀ-Ü][a-zà-ü]+\s+[A-Z]{1,3}[\s,]/.test(stripped) || /:\s+[A-Z]/.test(stripped.slice(0, 80));
  const yearParenMatch = stripped.match(/\((\d{4})\)/);
  const yearPlainMatch = stripped.match(/(?:[\s,;])(\d{4})(?=[;:,.\s]|$)/);
  const year = yearParenMatch ? yearParenMatch[1] : yearPlainMatch ? yearPlainMatch[1] : null;

  let authors = '', titlePart = '';

  if (isVancouver) {
    const colonIdx = stripped.indexOf(':');
    if (colonIdx > 5 && colonIdx < stripped.length - 10) {
      authors = stripped.slice(0, colonIdx).trim();
      const afterColon = stripped.slice(colonIdx + 1).trim();
      const titleMatch = afterColon.match(/^(.+?)\.(?:\s|$)/);
      titlePart = titleMatch ? titleMatch[1] : afterColon.split('.')[0];
    } else titlePart = stripped.slice(0, 200);
  } else if (year) {
    const yearParen = stripped.indexOf('(' + year + ')');
    const yearIdx = yearParen >= 0 ? yearParen : stripped.indexOf(year);
    const beforeYear = stripped.slice(0, yearIdx).trim().replace(/[,()\s]+$/, '');
    const afterYearStart = yearParen >= 0 ? yearParen + year.length + 2 : yearIdx + year.length;
    const afterYear = stripped.slice(afterYearStart).replace(/^[).:\s]+/, '').trim();
    authors = beforeYear;
    const titleMatch = afterYear.match(/^(.+?)\.(?:\s+[A-Z]|\s*$)/);
    titlePart = titleMatch ? titleMatch[1] : afterYear.split(/\.\s/)[0];
  } else {
    const parts = stripped.split(/\.\s+/);
    if (parts.length >= 2) { authors = parts[0]; titlePart = parts[1]; }
    else titlePart = stripped.slice(0, 200);
  }

  titlePart = (titlePart || '').trim().replace(/^[""\u201c]+|[""\u201d]+$/g, '');
  if (titlePart.length < 5) titlePart = stripped.slice(0, 200);
  authors = (authors || '').replace(/^[-–—•]\s*/, '').trim();
  if (authors.length > 300) authors = authors.slice(0, 300) + '…';
  if (titlePart.length < 5) return null;
  if (titlePart === authors) return null;
  return { title: titlePart.slice(0, 300), doi, authors, year, _raw: stripped };
}

// ── Extract article info from PDF first page (fallback when no DOI) ──
function extractArticleInfoFromPDFText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
  let titleCandidates = lines.slice(0, 15).filter(l => l.length > 20 && !/^(doi|vol|http|www\.|©|\d{4})/i.test(l));
  const title = titleCandidates.sort((a, b) => b.length - a.length)[0] || lines[0] || '';
  return { title, authors: '', year: '', journal: '', doi: '' };
}

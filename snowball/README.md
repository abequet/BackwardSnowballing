# Snowball — Backward Reference Extractor

A client-side web tool for **backward snowballing** in systematic reviews. Given a DOI, a PDF, or both, it extracts the full list of cited references with titles, authors, years, and clickable DOIs.

## Features

- **DOI lookup** — queries Crossref, OpenAlex & Semantic Scholar APIs simultaneously, picks the best source and supplements with unique refs from the others
- **PDF extraction** — parses reference sections from PDFs using pdf.js, with support for:
  - Two-column layouts (auto-detected)
  - APA author-year format
  - Vancouver numbered format
  - Hyphenation and line-break healing
- **Cross-check & merge** — when both DOI and PDF are provided, the tool merges both reference sets, filling gaps from each source
- **DOI resolution** — references without a DOI are automatically looked up via the Crossref bibliographic search API
- **Article info card** — displays metadata (title, authors, journal, year) of the article being analyzed
- **Export** — filter references, export to CSV, or copy all DOIs to clipboard

## How it works

```
┌──────────┐     ┌──────────────┐
│  DOI     │────▶│  Crossref    │
│  input   │     │  OpenAlex    │──┐
└──────────┘     │  Sem.Scholar │  │
                 └──────────────┘  │
                                   ▼
┌──────────┐     ┌──────────────┐  ┌─────────────┐     ┌──────────┐
│  PDF     │────▶│  pdf.js      │──▶│  Cross-check │────▶│ Results  │
│  upload  │     │  ref parser  │  │  & merge     │     │ + enrich │
└──────────┘     └──────────────┘  └─────────────┘     └──────────┘
```

## Usage

### Option 1 — Open directly

Open `index.html` in any modern browser. No server needed — everything runs client-side.

### Option 2 — Local server (recommended for development)

```bash
cd snowball
python3 -m http.server 8080
# then open http://localhost:8080
```

### Option 3 — GitHub Pages

Push to a GitHub repository and enable GitHub Pages on the `main` branch. The tool will be available at `https://<username>.github.io/BackwardSnowballing/`.

## Project structure

```
snowball/
├── index.html       # HTML shell, CSS, footer
├── js/
│   ├── utils.js     # Shared utilities (DOI cleaning, string similarity, dedup)
│   ├── api.js       # API interactions (Crossref, OpenAlex, Semantic Scholar)
│   ├── pdf.js       # PDF text extraction & reference section parsing
│   ├── merge.js     # Cross-check & merge logic (PDF refs + API refs)
│   ├── ui.js        # Rendering (results list, filter, CSV export, article card)
│   └── main.js      # App initialization, UI wiring, extraction pipeline
├── LICENSE          # MIT
├── .gitignore
└── README.md
```

## Limitations

- PDF parsing is heuristic-based and may not work perfectly on all reference formats or heavily formatted PDFs
- API coverage depends on the publisher: some publishers deposit complete reference lists in Crossref, others don't
- The Crossref DOI resolution for individual references is rate-limited; large reference lists may take a moment
- All processing is client-side: no data is sent to any server other than the public APIs (Crossref, OpenAlex, Semantic Scholar)

## Dependencies

- [pdf.js](https://mozilla.github.io/pdf.js/) (loaded from CDN) — PDF text extraction
- [DM Mono](https://fonts.google.com/specimen/DM+Mono) + [Source Serif 4](https://fonts.google.com/specimen/Source+Serif+4) (Google Fonts)

## Author

**Dr Adolphe Béquet**  
Chargé de recherche au [LESCOT](https://lescot.univ-gustave-eiffel.fr/) — Université Gustave Eiffel

## License

[MIT](LICENSE)

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

## Third-party APIs & data

This tool queries the following external APIs at runtime. No API keys are required for basic usage, but please review their terms:

| Service | Data license | Attribution | Terms |
|---------|-------------|-------------|-------|
| [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) | Public metadata, no formal data license | Not required | [Etiquette & rate limits](https://github.com/CrossRef/rest-api-doc#etiquette). Include `mailto` for polite pool access. |
| [OpenAlex API](https://docs.openalex.org/) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Appreciated but not required | [Terms of Service](https://openalex.org/OpenAlex_termsofservice.pdf). Free, 100k requests/day. |
| [Semantic Scholar API](https://www.semanticscholar.org/product/api) | [API License Agreement](https://www.semanticscholar.org/product/api/license) | **Required for public display** — must link back to semanticscholar.org | Non-commercial research/educational use. 100 req / 5 min without API key. |

**Privacy note:** All processing is client-side. PDFs are never uploaded to any server. The only network requests are to the APIs listed above, using the article's DOI and reference metadata as query parameters.

### Semantic Scholar attribution

As required by the Semantic Scholar API License Agreement, when data from Semantic Scholar is displayed publicly:

> Data source: [Semantic Scholar API](https://www.semanticscholar.org/?utm_source=api)

If you use this tool to produce results for a scientific publication, please also cite:
> Kinney, R. et al. "The Semantic Scholar Open Data Platform." *ArXiv*, abs/2301.10140, 2023.

## Dependencies

- [pdf.js](https://mozilla.github.io/pdf.js/) v3.11 (loaded from CDN) — client-side PDF text extraction
- [DM Mono](https://fonts.google.com/specimen/DM+Mono) + [Source Serif 4](https://fonts.google.com/specimen/Source+Serif+4) (Google Fonts)

## Author

**Dr Adolphe Béquet**  
Chargé de recherche au [LESCOT](https://lescot.univ-gustave-eiffel.fr/) — Université Gustave Eiffel

## License

[MIT](LICENSE)

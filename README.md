# Morris Hsieh — Personal Website

Personal site for Morris Chun-Mo Hsieh (谢君模), built on the N5 minimal resume template.

**Live URL:** https://morrishsieh3059.github.io

## Sections

- **Home** — Hero with NYC skyline
- **About** — Bio, interests, skills
- **Resume** — Work experience & education (GPA only, no semester grades)
- **NYC** — City life, history, walking routes
- **Travel** — Travel journal entries
- **Dining** — Restaurant picks in NYC & abroad
- **Gallery** — Photo gallery with filters
- **Contact** — Email & social links

## Setup

Install dependencies (Node.js required):

```bash
npm install
```

This installs dev tooling and copies Font Awesome + Google Fonts into `vendor/` (no CDN needed).

## Local development

```bash
npm start
```

Then visit http://localhost:8000

Or without npm: `python3 -m http.server 8000`

## Updating content

- **Dining/Travel entries:** Edit the journal cards in `index.html` under `#dining` and `#travel`
- **Photos:** Add images to `img/dining/`, `img/travel/`, or `img/nyc/` and reference in Gallery
- **NYC spots:** Update cards in the `#nyc` section
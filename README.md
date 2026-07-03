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

## Travel data (Google Timeline)

Rebuild travel trips and map from a Google export:

```bash
npm run build-travel -- /path/to/takeout.zip
# or drop export folder:
python3 scripts/parse-timeline.py /path/to/Takeout/
```

**Important:** Recent Google Takeout "Timeline" exports often contain only settings (history is on-device). For full visit data, export from the **Google Maps app**:

1. Maps → Profile → **Your Timeline**
2. Settings (gear) → **Export Timeline data**
3. Save the file, then run `npm run build-travel` with that path

Home bases are fixed: **Taipei** (until Aug 1, 2022) and **NYC** (since Aug 2, 2022). A trip starts when you leave base and ends when you return — shown as home pins, not travel destinations.

## Updating content

- **Dining entries:** Edit the journal cards in `index.html` under `#dining`
- **Photos:** Add images to `img/dining/`, `img/travel/`, or `img/nyc/` and reference in Gallery
- **NYC spots:** Update cards in the `#nyc` section
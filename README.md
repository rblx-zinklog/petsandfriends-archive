# Pets & Friends Archive

A static digital library for your own writings. Plain HTML, CSS and JavaScript: no backend, no build step, no frameworks. It works on Neocities (or any static host).

## Folder layout

```
index.html              Home page (introduction + recently published)
catalogue.html          Every publication, with filters, sorting and pages
search.html             Search page
about.html              About page
404.html                "Page not found" page (Neocities uses it automatically)
css/style.css           All styling and colours
js/site.js              Shared header/nav/footer, loads documents.json, publication pages
js/browse.js            Catalogue and search logic
data/documents.json     The list of publications and categories  <-- the one file you edit
documents/              One HTML file per publication
assets/                 Logo and icon
tools/                  Helper script and template (keep on your computer; do NOT upload)
```

## Adding a publication

### Option A: with the helper script (recommended)

You need Python 3 on your computer. From the project folder:

```
python tools/archive.py new
```

It asks for a title, category, description, tags and date, then creates `documents/<name>.html` and adds the entry to `data/documents.json`. Open the new file and write your text inside the `<article>`. Upload the new file and the updated `documents.json`.

Run `python tools/archive.py check` now and then. It reports missing files, unknown categories, bad dates, duplicate names and pages that are not listed.

### Option B: by hand

1. Copy `tools/document-template.html` into `documents/` and rename it (lowercase, hyphens, no spaces: `my-new-story.html`).
2. Replace `{{TITLE}}` in the `<title>` and write your text inside `<article class="document-body">`. Do not add an `<h1>`: the title is added from `documents.json`.
3. Add an entry to `data/documents.json`:

```json
{
  "title": "My New Story",
  "description": "One or two sentences shown in lists and search results.",
  "category": "stories",
  "date": "2026-11-13",
  "file": "documents/my-new-story.html",
  "tags": ["cats", "sea"]
}
```

`title`, `category`, `date` (YYYY-MM-DD) and `file` are required; `description` and `tags` are optional but recommended. The order of entries in the file does not matter. The site sorts by date.

Each file name must be unique, because the page finds its own entry in `documents.json` by file name.

## Categories

Categories are listed at the top of `documents.json`:

```json
{ "id": "stories", "name": "Stories & Tales", "description": "Shown on the home page and catalogue." }
```

To add one, add a new object and use its `id` in your publications. Everything (home page, sidebar, catalogue filter) updates automatically. If a publication uses a category id that is not listed, the site creates a category from the id so nothing disappears.

## Writing in your publication files

Use normal HTML: `<p>`, `<h2>`, `<h3>`, `<ul>`, `<ol>`, `<blockquote>`, `<em>`, `<strong>`, `<img>`. Some extras from the stylesheet:

- `<hr>` shows a decorative divider.
- `<div class="verse">` keeps line breaks, for poetry.
- `<p class="dedication">` is a centred italic line.
- `<p class="note">` is a boxed note.
- `<article class="document-body no-dropcap">` turns off the decorative first letter.

Put images in `assets/` and refer to them as `../assets/picture.png` from a publication.

## Putting it on Neocities

1. Upload everything **except the `tools/` folder** by dragging the files and folders into your Neocities dashboard (or use the Neocities command line tool). The free plan does not accept `.py` files, and you do not need them online.
2. Keep the same folder structure. `index.html` must be at the top level.
3. After uploading new publications, hard-refresh (Ctrl/Cmd + Shift + R) if you do not see them straight away.

As far as I know `.json` files are allowed on Neocities, but their list of accepted file types can change. If `documents.json` is rejected, check the current list in their help pages.

## Testing on your computer

Browsers will not load `documents.json` when you double-click an HTML file, so run a tiny local server from the project folder:

```
python -m http.server 8000
```

then open <http://localhost:8000>.

## Customising

- **Name, tagline, footer, nav, page size:** the `CONFIG` block at the top of `js/site.js`.
- **Colours and fonts:** the variables at the top of `css/style.css`.
- **Home and About text:** edit `index.html` and `about.html`. The `[bracketed]` parts of `about.html` are placeholders for you to fill in.
- **Sample publications:** the six included are placeholders. Delete their files in `documents/` and their entries in `documents.json` when you add your own.

## How it scales

The catalogue and search run in the visitor's browser over `documents.json` (about 300 bytes per entry, so hundreds of publications is well under 1 MB). Lists are paginated 20 per page. Search looks at titles, descriptions, categories and tags, not the full text of each document, so write good descriptions and tags. Searches and filters are kept in the address bar, so any result page can be bookmarked.

# Raindrop to Markdown

Import your [Raindrop.io](https://raindrop.io) bookmarks into Obsidian as clean, readable markdown — not just metadata, but the **actual content** of each link.

Built so bookmarked articles, YouTube videos, GitHub repos, and PDFs become a local knowledge base that AI tools can read and reason over.

## Why this plugin

Existing Raindrop-Obsidian plugins import metadata and your highlights. This one fetches what's *behind* each link and converts it to markdown, so a vault full of bookmarks becomes a vault full of readable content.

| Source type | What gets imported |
|---|---|
| Articles / blog posts | Cleaned body via Readability → Markdown |
| YouTube | Metadata + description (transcript best-effort) |
| GitHub repos | README + stars, language, topics |
| PDFs | Extracted text |
| Tools / landing pages | Page text (fallback scraper) |

## Install

1. Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/hestert67/raindrop-to-markdown/releases/latest)
2. Copy them into `YourVault/.obsidian/plugins/raindrop-to-markdown/`
3. Enable the plugin in Obsidian → Settings → Community plugins

### Build from source

```
git clone https://github.com/hestert67/raindrop-to-markdown
cd raindrop-to-markdown
npm install
npm run build
```

## Setup

1. Generate a Raindrop API token at [app.raindrop.io/settings/integrations](https://app.raindrop.io/settings/integrations) → Create new app → copy the Test token
2. In Obsidian: Settings → Raindrop to Markdown → paste token
3. Run **Raindrop to Markdown: Test Raindrop connection** to verify

## Commands

All commands are available via `Cmd+P` (Mac) / `Ctrl+P` (Windows/Linux).

| Command | What it does |
|---|---|
| Test Raindrop connection | Verifies your API token |
| List Raindrop collections | Prints collection IDs to the console |
| Test fetch on a single URL | Runs the full fetch pipeline on one URL |
| Dry run — import 10 bookmarks | Imports 10 most recent from your selected collection |
| Full sync — import all bookmarks | Imports your entire collection |

## Settings

| Setting | Default | Description |
|---|---|---|
| Raindrop API token | — | Required. Get from Raindrop integrations page |
| GitHub token | — | Optional. Raises GitHub API rate limit |
| Target folder | `Clippings` | Where imported files are saved |
| Filename template | `{{id}}_{{title}}` | Variables: `{{id}}`, `{{title}}` |
| Collection ID | `0` (all) | Set to a specific collection ID to sync one collection |
| Skip existing files | On | Don't overwrite files that already exist |
| Fetch articles | On | Toggle per content type |
| Fetch YouTube | On | |
| Fetch GitHub | On | |
| Fetch PDFs | On | |
| Fetch fallback | On | |
| Rate limit (ms) | `600` | Delay between requests |
| Fetch timeout (ms) | `20000` | Per-request timeout |

## Known limitations

- **YouTube transcripts** — YouTube's anti-scraping measures block automated transcript fetching for many videos. Metadata and description are always imported; transcripts are best-effort only.
- **No incremental sync** — Full sync walks every bookmark and skips existing files. Fast enough in practice; true cursor-based sync is a future improvement.
- **No rate-limit backoff** — Fixed 600ms delay. If you hit Raindrop's rate limits on very large collections, increase the rate limit setting.

## License

MIT

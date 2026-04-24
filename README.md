# Raindrop to Markdown

Import your [Raindrop.io](https://raindrop.io) bookmarks into Obsidian as clean, readable markdown — not just metadata, but the **actual content** of each link.

Built so bookmarked articles, YouTube videos, GitHub repos, and PDFs become a local knowledge base that AI tools can read and reason over.

## Why this plugin

Existing Raindrop-Obsidian plugins import metadata and your highlights. This one goes further: it fetches what's *behind* each link and converts it to markdown, so a vault full of bookmarks becomes a vault full of readable content.

| Source type | What gets imported |
|---|---|
| Articles / blog posts | Cleaned body via Readability → Markdown |
| YouTube | Transcript + metadata |
| GitHub repos | README + repo metadata |
| PDFs | Extracted text |
| Tools / landing pages | Page text (fallback) |

## Status

Early development. Active build by the author for personal use. Public-ready release coming once the 4,000-bookmark stress test passes.

## Install (dev)

```
git clone https://github.com/hestert67/raindrop-to-markdown
cd raindrop-to-markdown
npm install
npm run build
```

Copy `main.js`, `manifest.json`, `styles.css` into `YourVault/.obsidian/plugins/raindrop-to-markdown/` and enable in Obsidian settings → Community plugins.

## Setup

1. Generate a Raindrop API token at [app.raindrop.io/settings/integrations](https://app.raindrop.io/settings/integrations) → Create new app → copy the Test token.
2. In Obsidian: Settings → Raindrop to Markdown → paste token.
3. Run the command **"Raindrop to Markdown: Test connection"** to verify.

## License

MIT

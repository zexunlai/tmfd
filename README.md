# TMFD

Official website for **TMFD — Task Force on Music-related Financial Disclosures**, an independent music publication.

## Publish a new issue

1. Add the English and Chinese PDFs to `issues/`, using exactly the same date and title stem:
   - `YYYY-MM-DD-short-title.en.pdf` — English edition.
   - `YYYY-MM-DD-short-title.zh.pdf` — Traditional Chinese edition.
2. Commit and push them to `main`.

GitHub Actions rebuilds the issue index and deploys the refreshed site automatically. The newest issue becomes the homepage feature and every issue appears in the archive.

The filename date controls ordering and display. For example:

```text
issues/2026-10-18-listening-in-the-city.en.pdf
issues/2026-10-18-listening-in-the-city.zh.pdf
```

The two PDFs become one issue. Every issue exposes **Read online**, **Read online (中文)**, **Open PDF**, and **Open PDF (中文)** whenever both editions are present. A text-based PDF is automatically converted into a responsive, native web edition - no API key, service account, or extra HTML file is needed. The original PDFs remain available in separate browser tabs.

During publishing, TMFD also assigns one or two mandatory music genres from its built-in genre vocabulary and creates a hidden search index from distinctive article terms and names. Generic terms such as “music”, “tickets”, “buy”, and their Chinese equivalents are intentionally excluded from search. The genre vocabulary is designed to be extended when TMFD covers a new style.

## Local preview

Run `node scripts/build-site.mjs`, then open `_site/index.html` in a browser.


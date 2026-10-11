# TMFD

Official website for **TMFD — Task Force on Music-related Financial Disclosures**, an independent music publication.

## Publish a new issue

1. Add one or both of these files to `issues/`, using the same filename stem:
   - `YYYY-MM-DD-short-title.pdf` — publishes a PDF-first issue.
   - `YYYY-MM-DD-short-title.html` — publishes a browser reading version.
2. Commit and push them to `main`.

GitHub Actions rebuilds the issue index and deploys the refreshed site automatically. The newest issue becomes the homepage feature and every issue appears in the archive.

The filename date controls ordering and display. For example:

```text
issues/2026-10-18-listening-in-the-city.pdf
issues/2026-10-18-listening-in-the-city.html
```

You can publish with either file on its own. Every issue has a **Read online** link to a TMFD reading page. For a text-based PDF, the publishing workflow automatically converts its text into a responsive, native web edition - no API key, service account, or extra HTML file is needed. The original PDF also remains available through **Open PDF** in a separate browser tab. If a PDF is an image-only scan, or if you need an exact bespoke layout, add an HTML issue with the same filename stem; that remains the fallback. Keep any HTML issue self-contained: use relative links for images or supporting files stored under `issues/`.

## Local preview

Run `node scripts/build-site.mjs`, then open `_site/index.html` in a browser.


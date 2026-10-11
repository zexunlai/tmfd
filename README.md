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

You can publish with either file on its own. When both are present, the site shows a **Read online** link plus a **Download PDF** link. When only a PDF is present, the site offers **Open PDF** and **Download PDF**. Keep any HTML issue self-contained: use relative links for images or supporting files stored under `issues/`.

## Local preview

Run `node scripts/build-site.mjs`, then open `_site/index.html` in a browser.


# TMFD

Official website for **TMFD — Task Force on Music-related Financial Disclosures**, an independent music publication.

## Publish a new issue

1. Add these two files to `issues/`, using the same filename stem:
   - `YYYY-MM-DD-short-title.html`
   - `YYYY-MM-DD-short-title.pdf`
2. Commit and push them to `main`.

GitHub Actions rebuilds the issue index and deploys the refreshed site automatically. The newest issue becomes the homepage feature and every issue appears in the archive.

The filename date controls ordering and display. For example:

```text
issues/2026-10-18-listening-in-the-city.html
issues/2026-10-18-listening-in-the-city.pdf
```

Only matching HTML/PDF pairs are published in the archive. Keep issue files self-contained: use relative links for any images or supporting files stored under `issues/`.

## Local preview

Run `node scripts/build-site.mjs`, then open `_site/index.html` in a browser.


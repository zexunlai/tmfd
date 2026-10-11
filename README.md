# TMFD

Official website for **TMFD — Task Force on Music-related Financial Disclosures**, an independent music publication.

## Publish a new issue

1. Add each PDF to its language folder, using exactly the same date and title stem when both editions exist:
   - `issues/en/YYYY-MM-DD-short-title.pdf` — English edition.
   - `issues/zh/YYYY-MM-DD-short-title.pdf` — Traditional Chinese edition.
2. Commit and push them to `main`.

GitHub Actions rebuilds the issue index and deploys the refreshed site automatically. The newest issue becomes the homepage feature and every issue appears in the archive.

The filename date controls ordering and display. For example:

```text
issues/en/2026-10-18-listening-in-the-city.pdf
issues/zh/2026-10-18-listening-in-the-city.pdf
```

The two PDFs become one issue when both exist, but either language can be published by itself. The site defaults to English whenever it is present; if an English file is absent, it automatically uses the Chinese edition instead. Only the reading and PDF options for uploaded files are shown. The homepage exposes only the default **Read online** link, while Magazine exposes the available online-reading links. A text-based PDF is automatically converted into a responsive, native web edition - no API key, service account, extra HTML file, cover image, or article image is needed. The original PDFs remain available in separate browser tabs.

## PDF-only folder structure

The first page of each uploaded PDF becomes the horizontal cover image on Home, Magazine and the reader. Images embedded in the PDF are extracted and inserted after their original PDF page in the reading edition.

Only use these two folders for weekly publishing:

```text
issues/en/YYYY-MM-DD-short-title.pdf
issues/zh/YYYY-MM-DD-short-title.pdf
```

Do not create `covers` or `media` folders. If only one language is uploaded, the site uses that edition automatically; when both exist, it prefers English and provides the Chinese reading option.

During publishing, TMFD also assigns one or two mandatory music genres from its built-in genre vocabulary and creates a hidden search index from distinctive article terms and names. Generic terms such as “music”, “tickets”, “buy”, and their Chinese equivalents are intentionally excluded from search. The genre vocabulary is designed to be extended when TMFD covers a new style.

## Local preview

Run `node scripts/build-site.mjs`, then open `_site/index.html` in a browser.


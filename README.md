# TMFD

Official website for **TMFD — Task Force on Music-related Financial Disclosures**, an independent music publication.

## Publish a new issue

1. Add each PDF to its language folder, using exactly the same date and title stem when both editions exist. Add the language at the end of each filename:
   - `issues/en/YYYY-MM-DD-short-title-en.pdf` — English edition.
   - `issues/zh/YYYY-MM-DD-short-title-zh.pdf` — Traditional Chinese edition.
2. Double-click **Prepare TMFD PDFs.command** in this folder. It automatically prepares only oversized PDFs for GitHub and stores a safe copy of each original in `Documents/TMFD Original PDFs`.
3. In GitHub Desktop, commit and push them to `main`.

GitHub Actions rebuilds the issue index and deploys the refreshed site automatically. The newest issue becomes the homepage feature and every issue appears in the archive.

The filename date controls ordering and display. For example:

```text
issues/en/2026-10-18-listening-in-the-city-en.pdf
issues/zh/2026-10-18-listening-in-the-city-zh.pdf
```

If the uploaded PDFs are already below GitHub's limit, the preparation tool does nothing. It is safe to run each time before you commit.

The two PDFs become one issue when both exist, but either language can be published by itself. The site defaults to English whenever it is present; if an English file is absent, it automatically uses the Chinese edition instead. Only the reading and PDF options for uploaded files are shown. The homepage exposes only the default **Read online** link, while Magazine exposes the available online-reading links. A text-based PDF is automatically converted into a responsive, native web edition - no API key, service account, extra HTML file, cover image, or article image is needed. The original PDF opens inside the reading page when a reader selects Open PDF.

## PDF-only folder structure

The first page of each uploaded PDF becomes the horizontal cover image on Home, Magazine and the reader. It is the only image cropped to a horizontal frame with the orange treatment. Editorial images embedded in later pages are inserted after their source page and keep their original portrait, square, or landscape proportion in a pale-gray frame.

The web conversion also reads the PDF's text hierarchy: serif display text and large type become titles; body-scale text becomes reading copy; the first occurrence of a numbered running header becomes a section label; repeated headers, continuation labels, page numbers, lower-page footers, page textures, and TMFD logo/wordmark assets are omitted. This is automatic, so keep important headings as real selectable text in the PDF rather than flattening them into an image. The Open PDF buttons display the selected PDF inside the reading page.

Only use these two folders for weekly publishing:

```text
issues/en/YYYY-MM-DD-short-title-en.pdf
issues/zh/YYYY-MM-DD-short-title-zh.pdf
```

Do not create `covers` or `media` folders. The `-en` and `-zh` suffixes are removed from the public issue title automatically. If only one language is uploaded, the site uses that edition automatically; when both exist, it prefers English and provides the Chinese reading option.

During publishing, TMFD also assigns one or two mandatory music genres from its built-in genre vocabulary and creates a hidden search index from distinctive article terms and names. Generic terms such as “music”, “tickets”, “buy”, and their Chinese equivalents are intentionally excluded from search. The genre vocabulary is designed to be extended when TMFD covers a new style.

## Local preview

Run `node scripts/build-site.mjs`, then open `_site/index.html` in a browser.


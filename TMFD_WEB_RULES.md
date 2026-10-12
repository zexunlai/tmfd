# TMFD web edition — conversion and layout rules

This file is the maintained specification for converting each bilingual TMFD
PDF issue into its responsive web edition. The PDFs in `issues/en/` and
`issues/zh/` remain the source material; the site is regenerated from them.

## 1. Editorial structure

- The PDF's numbered contents (`01` through `08`) is the only source for the
  web Contents menu. Dates, artist names, and running headers never become
  Contents entries.
- Retain real chapter titles, section titles, artist names, song/album titles,
  publication text, body text, and external hyperlinks.
- Exclude running headers after their first meaningful occurrence, all page
  numbers, and print-only footers.
- Each artist/work identity follows a stable sequence: **artist → work title →
  year/date → editorial copy → listening or release links**. A song title must
  never be merged into its artist heading. Example: `No Party For Cao Dong
  (草東沒有派對)` is the artist; `Simon Says (大風吹)` is the song title.
- Preserve external PDF links on the web. Do not expose print-only labels such
  as `Source / licence` or `來源 / 授權`; link the underlying final-credit
  record instead.

## 2. Image and source rules

- The first designated cover visual is the cover and may receive the orange
  offset frame. It is cropped only as a cover.
- Editorial images retain their original aspect ratio in a light-grey frame.
  The source PDF's TMFD wordmark, page texture, logos, and other layout assets
  are never treated as editorial images.
- Match images to story blocks in PDF reading order. The first image in a
  section appears on the right; further images alternate sides only between
  complete story blocks.
- Copy wraps beside a floated image and resumes at full width below it. A
  heading-only image card is not allowed.
- **Do not show image captions, image descriptions, licences, attribution, or
  image-source links next to article images on the web.** All of those records
  belong exclusively in chapter 08, `Credits & Sources` / `影像與資料`.

## 3. Type scale and line spacing

The web reader maps PDF hierarchy to these controlled sizes (rather than
copying arbitrary PDF point sizes):

| Role | Web equivalent | Size |
| --- | --- | --- |
| Chapter and Contents heading | `h1` | 32 pt |
| Section heading / large pull line / artist or band | `h2` / `h3` | 20 pt |
| Work, album, performance, song title | lead line | 16 pt |
| Body text | paragraph | 14 pt |
| Date, heading, caption, source, licence, link | metadata | 10 pt |
| Page number / PDF footer | omitted | 9 pt in PDF only |

- Body and lead-copy line height is `1.7`; metadata uses a separately fixed
  compact leading. Do not introduce one-off line heights.
- English headings use Georgia; English reader text uses Times New Roman.
- Chinese headings use SimSun. On Apple mobile systems where SimSun is not
  installed, use Songti TC as the closest system fallback. Chinese reader text
  uses Microsoft JhengHei, with system sans fallbacks.
- Mixed-language runs retain the font of their own language.

## 4. Responsive reader behaviour

- Desktop: the Contents and magazine search panels stay floating while the
  reader scrolls. Contents navigation uses smooth scrolling, respecting
  reduced-motion preferences.
- Mobile: Contents becomes an expandable upper-right menu; the back-to-top
  control is lower-right. Reader content and images must have `min-width: 0`
  and never force horizontal scrolling.
- The publication identity should balance naturally. On a narrow display it
  may become two lines, but `Disclosures` must not be stranded by itself.
- Mobile hides per-image source material because chapter 08 is the canonical
  source list; desktop follows the same rule.

## 5. PDF preview

- Desktop Open PDF replaces the cover position with a responsive two-page
  preview. The opening spread is blank page `-1` on the left and cover page
  `0` on the right; subsequent even-numbered pages remain on the right.
- Spread turns animate unless the reader requests reduced motion.
- Mobile Open PDF opens the original PDF in a new browser tab.

## 6. Release checklist

Before publishing a PDF update, verify both English and Chinese editions:

1. Contents has only the eight numbered chapters and every item smooth-scrolls
   to the correct section.
2. Artist, song/album, year, image, and introductory copy remain matched.
3. No logos or PDF layout decorations become article images.
4. No image attribution appears beside an article image; chapter 08 still
   carries clickable complete records.
5. At desktop and mobile widths: no horizontal overflow, consistent leading,
   no orphaned identity word, and no empty image/text card.
6. Open PDF gives the correct device-specific view and page ordering.

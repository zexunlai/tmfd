(async () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const title = document.getElementById('issue-title');
  const date = document.getElementById('issue-date');
  const content = document.getElementById('reader-content');
  const navigation = document.getElementById('reader-navigation');
  const actions = document.getElementById('reader-actions');
  const backToTop = document.getElementById('back-to-top');
  const issueId = new URLSearchParams(window.location.search).get('issue');
  const requestedLanguage = new URLSearchParams(window.location.search).get('lang');

  const updateBackToTop = () => { backToTop.hidden = window.scrollY < 360; };
  backToTop.addEventListener('click', () => window.scrollTo({
    top: 0,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  }));
  window.addEventListener('scroll', updateBackToTop, { passive: true });
  updateBackToTop();

  try {
    const response = await fetch('../data/issues.json');
    if (!response.ok) throw new Error('Issue index unavailable');
    const issues = await response.json();
    const issue = issues.find((entry) => entry.id === issueId);
    if (!issue) throw new Error('Issue not found');
    const language = issue.languages?.[requestedLanguage] ? requestedLanguage : (issue.languages?.en ? 'en' : 'zh');
    const edition = issue.languages?.[language];
    if (!edition) throw new Error('Language edition not found');

    document.documentElement.lang = language === 'zh' ? 'zh-Hant' : 'en';
    content.dataset.language = language;

    title.textContent = issue.title;
    date.textContent = `${issue.dateLabel} · ${language === 'zh' ? '中文' : 'English'}`;
    if (edition.web) {
      const response = await fetch(`../${edition.web}`);
      if (!response.ok) throw new Error('Reading edition unavailable');
      // The fragment is generated during the local/GitHub build from escaped PDF text.
      content.innerHTML = await response.text();
    } else if (edition.html) {
      const frame = document.createElement('iframe');
      frame.className = 'issue-reader';
      frame.src = `../${edition.html}`;
      frame.title = `${issue.title} — TMFD`;
      content.append(frame);
    } else {
      throw new Error('Issue has no readable source');
    }

    // Publication identity is a single English phrase in the Chinese edition.
    // Keep meaningful word groups together so a narrow screen never leaves
    // “Disclosures” alone on a second line.
    const publicationIdentity = [...content.querySelectorAll('.web-section:first-child .web-secondary')]
      .find((heading) => /task force on music-related financial disclosures/iu.test(heading.textContent));
    if (publicationIdentity) {
      publicationIdentity.classList.add('web-publication-identity');
      const englishName = publicationIdentity.querySelector('[lang="en"]');
      if (englishName && /task force on music-related financial disclosures/iu.test(englishName.textContent)) {
        const firstLine = 'Task Force on Music-related';
        const secondLine = 'Financial Disclosures';
        englishName.replaceChildren();
        for (const line of [firstLine, secondLine]) {
          const group = document.createElement('span');
          group.className = 'publication-identity-group';
          group.textContent = line;
          englishName.append(group, document.createTextNode(' '));
        }
      }
    }

    const coverSource = issue.covers?.[language] || issue.cover;
    if (coverSource) {
      const cover = document.createElement('figure');
      cover.className = 'reader-cover';
      const image = document.createElement('img');
      image.src = `../${coverSource}`;
      image.alt = `${issue.title} cover artwork`;
      cover.append(image);
      const firstSection = content.querySelector('.web-section');
      if (firstSection) firstSection.after(cover);
    }

    const buildContents = () => {
      // The PDF's own numbered contents page is the source of truth. Do not
      // infer a contents list from dates, artist names, or running headers.
      const sourceContents = issue.languages?.[language]?.contents || [];
      const entries = sourceContents.flatMap(({ number, title: entryTitle, page }) => {
        const section = content.querySelector(`[data-pdf-page="${page}"]`);
        if (!section || !entryTitle) return [];
        section.id = `section-${number}`;
        return [{ section, text: `${number} ${entryTitle}` }];
      });
      if (!entries.length) return;
      navigation.replaceChildren();
      const title = document.createElement('p');
      title.className = 'reader-navigation-title';
      title.textContent = 'Contents';
      const makeLink = ({ section, text }) => {
        const link = document.createElement('a');
        link.href = `#${section.id}`;
        link.textContent = text;
        return link;
      };

      const list = document.createElement('div');
      list.className = 'reader-navigation-list';
      entries.forEach((entry) => {
        list.append(makeLink(entry));
      });

      // Desktop keeps the full sidebar. On smaller screens this becomes a
      // compact, independently expandable menu in the upper-right corner.
      const mobileMenu = document.createElement('details');
      mobileMenu.className = 'reader-contents-menu';
      const summary = document.createElement('summary');
      summary.textContent = 'Contents';
      const mobileList = document.createElement('div');
      mobileList.className = 'reader-contents-menu-list';
      entries.forEach((entry) => {
        mobileList.append(makeLink(entry));
      });
      mobileList.addEventListener('click', () => {
        mobileMenu.open = false;
      });
      mobileMenu.append(summary, mobileList);

      navigation.append(title, list, mobileMenu);
      navigation.hidden = false;
    };
    buildContents();

    const showPdf = (pdfPages, pdf, label) => {
      let viewer = content.querySelector('.reader-pdf-cover');
      if (!viewer) {
        viewer = document.createElement('section');
        viewer.className = 'reader-pdf-cover';
        viewer.setAttribute('aria-label', `${issue.title} PDF preview`);
        const cover = content.querySelector('.reader-cover');
        if (cover) cover.replaceWith(viewer);
        else content.prepend(viewer);
      }
      viewer.replaceChildren();
      if (pdfPages?.length) {
        // PDF cover is page 0. Books open with it on the right, opposite a
        // deliberately blank page -1; every later even page is also right.
        let spreadStart = -1;
        const controls = document.createElement('div');
        controls.className = 'reader-pdf-controls';
        const previous = document.createElement('button');
        previous.type = 'button';
        previous.textContent = 'Previous pages';
        const pageLabel = document.createElement('span');
        const next = document.createElement('button');
        next.type = 'button';
        next.textContent = 'Next pages';
        const open = document.createElement('a');
        open.href = `../${pdf}`;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        open.textContent = 'Open original PDF';
        controls.append(previous, pageLabel, next, open);
        const spread = document.createElement('div');
        spread.className = 'reader-pdf-spread';
        const renderSpread = (turn = '') => {
          spread.replaceChildren();
          for (const pageIndex of [spreadStart, spreadStart + 1]) {
            if (pageIndex < 0 || pageIndex >= pdfPages.length) {
              const blank = document.createElement('div');
              blank.className = 'reader-pdf-blank';
              blank.setAttribute('aria-hidden', 'true');
              spread.append(blank);
              continue;
            }
            const image = document.createElement('img');
            image.src = `../${pdfPages[pageIndex]}`;
            image.alt = `${issue.title} — ${label}, ${pageIndex === 0 ? 'cover' : `page ${pageIndex}`}`;
            spread.append(image);
          }
          spread.classList.remove('is-turning-forward', 'is-turning-back');
          if (turn) {
            // Restart the short CSS page-turn transition for each new spread.
            void spread.offsetWidth;
            spread.classList.add(turn === 'forward' ? 'is-turning-forward' : 'is-turning-back');
          }
          previous.disabled = spreadStart <= -1;
          next.disabled = spreadStart + 1 >= pdfPages.length;
          pageLabel.textContent = spreadStart === -1
            ? `Cover · ${pdfPages.length} pages`
            : `Pages ${spreadStart}–${Math.min(spreadStart + 1, pdfPages.length - 1)} of ${pdfPages.length - 1}`;
        };
        previous.addEventListener('click', () => {
          spreadStart = spreadStart <= 1 ? -1 : spreadStart - 2;
          renderSpread('back');
        });
        next.addEventListener('click', () => {
          spreadStart = spreadStart === -1 ? 1 : Math.min(pdfPages.length - 1, spreadStart + 2);
          renderSpread('forward');
        });
        viewer.append(controls, spread);
        renderSpread();
      } else {
        const frame = document.createElement('iframe');
        frame.className = 'reader-pdf-cover-frame';
        frame.title = `${issue.title} — ${label}`;
        frame.src = `../${pdf}#view=FitH`;
        viewer.append(frame);
      }
      viewer.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start'
      });
    };

    const configure = (id, code, label, pdf = false) => {
      const link = document.getElementById(id);
      const alternative = issue.languages?.[code];
      if (!alternative || !(pdf ? alternative.pdf : (alternative.web || alternative.html))) return;
      link.classList.remove('is-current');
      link.removeAttribute('aria-current');
      link.removeAttribute('aria-disabled');
      link.removeAttribute('tabindex');
      if (!pdf && code === language) {
        link.removeAttribute('href');
        link.classList.add('is-current');
        link.setAttribute('aria-current', 'page');
        link.setAttribute('aria-disabled', 'true');
        link.tabIndex = -1;
      } else {
        link.href = pdf ? `../${alternative.pdf}` : `?issue=${encodeURIComponent(issue.id)}&lang=${code}`;
        if (pdf) {
          link.addEventListener('click', (event) => {
            if (window.matchMedia('(max-width: 820px)').matches) return;
            event.preventDefault();
            showPdf(alternative.pdfPages, alternative.pdf, label);
          });
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
      }
      link.textContent = label;
      link.hidden = false;
    };
    configure('read-online-en', 'en', 'Read online');
    configure('read-online-zh', 'zh', 'Read online in Chinese');
    configure('open-pdf-en', 'en', 'Open PDF', true);
    configure('open-pdf-zh', 'zh', 'Open PDF (Chinese)', true);
    actions.hidden = false;

    // Keep the action choices beside the leading issue information without
    // rearranging ancestors from the generated PDF fragment.  The previous
    // implementation accidentally attempted to insert a feature inside one
    // of its own descendants, which aborts the reader in browsers.
    const leadCopy = content.querySelector('.web-section .web-feature-copy');
    if (leadCopy) {
      const intro = document.createElement('div');
      intro.className = 'article-intro';
      const information = document.createElement('div');
      information.className = 'article-intro-information';
      information.append(...leadCopy.children);
      intro.append(information, actions);
      leadCopy.append(intro);
    }
    content.classList.add('is-ready');
    requestAnimationFrame(() => actions.classList.add('is-ready'));
  } catch (_) {
    title.textContent = 'Issue unavailable';
    content.replaceChildren();
    const message = document.createElement('p');
    message.className = 'reader-fallback';
    message.textContent = 'This issue could not be found. Please return to the archive and try again.';
    content.append(message);
  }
})();

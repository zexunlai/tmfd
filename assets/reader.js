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
    // Give it a dedicated class so its English words never wrap into an orphan.
    const publicationIdentity = [...content.querySelectorAll('.web-section:first-child .web-secondary')]
      .find((heading) => /task force on music-related financial disclosures/iu.test(heading.textContent));
    if (publicationIdentity) publicationIdentity.classList.add('web-publication-identity');

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
        let spreadStart = 0;
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
        const renderSpread = () => {
          spread.replaceChildren();
          const pages = pdfPages.slice(spreadStart, spreadStart + 2);
          pages.forEach((page, offset) => {
            const image = document.createElement('img');
            image.src = `../${page}`;
            image.alt = `${issue.title} — ${label}, page ${spreadStart + offset + 1}`;
            spread.append(image);
          });
          previous.disabled = spreadStart === 0;
          next.disabled = spreadStart + 2 >= pdfPages.length;
          pageLabel.textContent = `Pages ${spreadStart + 1}–${Math.min(spreadStart + 2, pdfPages.length)} of ${pdfPages.length}`;
        };
        previous.addEventListener('click', () => {
          spreadStart = Math.max(0, spreadStart - 2);
          renderSpread();
        });
        next.addEventListener('click', () => {
          spreadStart = Math.min(Math.max(0, pdfPages.length - 1), spreadStart + 2);
          renderSpread();
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

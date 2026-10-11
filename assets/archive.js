(() => {
  const genericTerms = new Set(['music', 'musical', 'song', 'songs', 'album', 'albums', 'artist', 'artists', 'ticket', 'tickets', 'buy', 'purchase', 'shop', 'store', 'merch', 'merchandise', 'event', 'events', 'listen', 'listening', 'audio', 'sound', '音樂', '歌曲', '專輯', '購票', '票券', '買', '購買', '商品', '周邊', '演出', '活動', '聆聽', '聲音']);
  const normalize = (value) => value.toLocaleLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const distance = (left, right) => {
    const row = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= right.length; j += 1) {
        const saved = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
        previous = saved;
      }
    }
    return row[right.length];
  };
  const subsequence = (needle, haystack) => {
    let index = 0;
    for (const character of haystack) if (character === needle[index]) index += 1;
    return index === needle.length;
  };
  const validTerms = (query) => normalize(query).split(' ').filter((term) => {
    if (!term || genericTerms.has(term)) return false;
    const isChinese = /\p{Script=Han}/u.test(term);
    return isChinese ? term.length >= 2 : term.length >= 3;
  });
  const wordScore = (term, word) => {
    if (word === term) return 100;
    if (word.startsWith(term) || term.startsWith(word)) return 75;
    if (term.length > 3 && subsequence(term, word)) return 55;
    const allowance = term.length > 6 ? 2 : 1;
    return Math.abs(term.length - word.length) <= allowance && distance(term, word) <= allowance ? 45 : 0;
  };
  const searchScore = (issue, query) => {
    if (!query.trim()) return 1;
    const terms = validTerms(query);
    if (!terms.length) return 0;
    const searchable = normalize([issue.title, ...(issue.genres || []), ...(issue.searchTerms || [])].join(' '));
    const words = searchable.split(' ');
    return terms.reduce((total, term) => {
      const score = searchable.includes(term) ? 100 : Math.max(...words.map((word) => wordScore(term, word)));
      return score ? total + score : 0;
    }, 0);
  };
  const createFilterButton = (label, isActive, onClick) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-button${isActive ? ' is-active' : ''}`;
    button.setAttribute('aria-pressed', String(isActive));
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  };

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
  const list = document.getElementById('archive-list');
  const search = document.getElementById('issue-search');
  const genreFilters = document.getElementById('genre-filters');
  const resultCount = document.getElementById('result-count');
  let selectedGenre = '';
  let issues = [];

  const addLink = (links, issue, language, label) => {
    const edition = issue.languages?.[language];
    if (!edition || !(edition.web || edition.html)) return;
    const link = document.createElement('a');
    link.href = `../read/?issue=${encodeURIComponent(issue.id)}&lang=${language}`;
    link.textContent = label;
    links.append(link);
  };
  const renderIssue = (issue) => {
    const item = document.createElement('article');
    item.className = 'archive-item';
    const details = document.createElement('a');
    details.className = 'issue-card-link';
    details.href = `../read/?issue=${encodeURIComponent(issue.id)}&lang=${issue.languages?.en ? 'en' : 'zh'}`;
    const date = document.createElement('p');
    date.className = 'eyebrow';
    date.textContent = issue.dateLabel;
    const title = document.createElement('h2');
    title.textContent = issue.title;
    const summary = document.createElement('p');
    summary.className = 'issue-summary';
    summary.textContent = issue.excerpt;
    const genres = document.createElement('div');
    genres.className = 'issue-genres';
    (issue.genres || []).forEach((label) => {
      const genre = document.createElement('span');
      genre.className = 'issue-genre';
      genre.textContent = label;
      genres.append(genre);
    });
    details.append(date, title, summary, genres);

    if (issue.cover) {
      const cover = document.createElement('img');
      cover.className = 'archive-cover';
      cover.src = `../${issue.cover}`;
      cover.alt = `${issue.title} cover artwork`;
      cover.loading = 'lazy';
      details.prepend(cover);
    }

    const links = document.createElement('div');
    links.className = 'archive-links';
    addLink(links, issue, 'en', 'Read online');
    addLink(links, issue, 'zh', 'Read online in Chinese');
    item.append(details, links);
    return item;
  };
  const render = () => {
    const query = search.value;
    const results = issues
      .map((issue) => ({ issue, score: searchScore(issue, query) }))
      .filter(({ issue, score }) => score && (!selectedGenre || issue.genres?.includes(selectedGenre)))
      .sort((left, right) => query ? right.score - left.score || right.issue.date.localeCompare(left.issue.date) : right.issue.date.localeCompare(left.issue.date));
    list.replaceChildren(...(results.length ? results.map(({ issue }) => renderIssue(issue)) : (() => {
      const message = document.createElement('p');
      message.className = 'reader-fallback';
      message.textContent = query.trim() && !validTerms(query).length
        ? 'Use two Chinese characters or three Latin letters. General terms are not indexed.'
        : 'No issues match this search yet.';
      return [message];
    })()));
    resultCount.textContent = `${results.length} ${results.length === 1 ? 'issue' : 'issues'} found`;
  };
  const renderFilters = () => {
    const genres = [...new Set(issues.flatMap((issue) => issue.genres || []))].sort();
    genreFilters.replaceChildren(
      createFilterButton('All genres', !selectedGenre, () => { selectedGenre = ''; renderFilters(); render(); }),
      ...genres.map((genre) => createFilterButton(genre, selectedGenre === genre, () => { selectedGenre = selectedGenre === genre ? '' : genre; renderFilters(); render(); }))
    );
  };

  search.addEventListener('input', render);
  (async () => {
    try {
      const response = await fetch('../data/issues.json');
      if (!response.ok) throw new Error('Issue index unavailable');
      issues = await response.json();
      if (!issues.length) {
        list.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'The first TMFD issue is coming soon.' }));
        return;
      }
      renderFilters();
      render();
    } catch (_) {
      list.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'The magazine is temporarily unavailable. Please try again shortly.' }));
    }
  })();
})();

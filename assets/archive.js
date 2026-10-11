(async () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
  const list = document.getElementById('archive-list');

  try {
    const response = await fetch('../data/issues.json');
    if (!response.ok) throw new Error('Issue index unavailable');
    const issues = await response.json();
    if (!issues.length) {
      list.innerHTML = '<p>The first TMFD issue is coming soon.</p>';
      return;
    }
    list.replaceChildren(...issues.map((issue) => {
      const item = document.createElement('article');
      item.className = 'archive-item';
      item.innerHTML = `<div><p class="eyebrow">${issue.dateLabel}</p><h2>${issue.title}</h2></div><div class="archive-links"><a href="${issue.html}">Read online</a><a href="${issue.pdf}">PDF</a></div>`;
      return item;
    }));
  } catch (_) {
    list.innerHTML = '<p>The archive is temporarily unavailable. Please try again shortly.</p>';
  }
})();


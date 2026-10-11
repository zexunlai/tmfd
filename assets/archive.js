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
      const details = document.createElement('div');
      const date = document.createElement('p');
      date.className = 'eyebrow';
      date.textContent = issue.dateLabel;
      const title = document.createElement('h2');
      title.textContent = issue.title;
      details.append(date, title);

      const links = document.createElement('div');
      links.className = 'archive-links';
      if (issue.html || issue.pdf) {
        const read = document.createElement('a');
        read.href = issue.html || issue.pdf;
        read.textContent = issue.html ? 'Read online' : 'Open PDF';
        if (!issue.html) read.target = '_blank';
        links.append(read);
      }
      if (issue.pdf) {
        const pdf = document.createElement('a');
        pdf.href = issue.pdf;
        pdf.download = '';
        pdf.textContent = 'Download PDF';
        links.append(pdf);
      }

      item.append(details, links);
      return item;
    }));
  } catch (_) {
    list.innerHTML = '<p>The archive is temporarily unavailable. Please try again shortly.</p>';
  }
})();


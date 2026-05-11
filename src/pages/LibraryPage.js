/**
 * Library Page v2
 */
import bookStorage from '../services/BookStorage.js';
import router from '../utils/router.js';
import { icon } from '../utils/icons.js';
import { escapeHtml, truncate } from '../utils/helpers.js';

export async function renderLibraryPage(container) {
  container.innerHTML = '';
  const page = document.createElement('div');
  page.className = 'page page--wide';
  page.innerHTML = `<header class="page-header"><h1>Library</h1><div class="header-actions"><button class="btn-icon" id="imp" type="button" aria-label="Import book">${icon('plus')}</button></div></header><div id="lc"><div class="loading-center"><div class="spinner"></div></div></div><input type="file" id="fi" accept="application/epub+zip,.epub" style="display:none" multiple>`;
  container.appendChild(page);
  const importJobs = [];
  page.querySelector('#imp').onclick = () => page.querySelector('#fi').click();
  page.querySelector('#fi').onchange = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;

    files.forEach((file) => importJobs.push({
      id: `${Date.now()}-${Math.random()}`,
      name: file.name.replace(/\.epub$/i, ''),
      file,
      pct: 0,
      status: 'Queued',
    }));
    refresh();

    for (const job of [...importJobs]) {
      try {
        job.status = 'Reading file'; job.pct = 12; refresh();
        await new Promise(resolve => setTimeout(resolve, 80));
        job.status = 'Extracting cover'; job.pct = 38; refresh();
        const addPromise = bookStorage.addBook(job.file);
        await new Promise(resolve => setTimeout(resolve, 120));
        job.status = 'Saving book'; job.pct = 76; refresh();
        await addPromise;
        job.status = 'Complete'; job.pct = 100; refresh();
        await new Promise(resolve => setTimeout(resolve, 260));
      } catch (err) {
        console.error(err);
        job.status = 'Import failed'; job.pct = 100; job.failed = true; refresh();
        await new Promise(resolve => setTimeout(resolve, 900));
      } finally {
        const index = importJobs.indexOf(job);
        if (index >= 0) importJobs.splice(index, 1);
        refresh();
      }
    }
  };
  const refresh = async () => {
    const lc = page.querySelector('#lc');
    const books = await bookStorage.getAllBooks();
    if (!books.length && !importJobs.length) { lc.innerHTML = `<div class="empty">${icon('library')}<h3>No books yet</h3><p>Tap + to import a file.</p></div>`; return; }
    books.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
    const importingHtml = importJobs.map(job => `
      <div class="lib-card lib-importing ${job.failed ? 'is-failed' : ''}">
        <div class="lib-cover lib-import-cover">
          <div class="import-ring" style="--p:${job.pct}"><span>${Math.round(job.pct)}%</span></div>
        </div>
        <div class="lib-title">${escapeHtml(truncate(job.name, 36))}</div>
        <div class="lib-author">${escapeHtml(job.status)}</div>
      </div>`).join('');
    const booksHtml = books.map(b => `
      <div class="lib-card ${b.completed ? 'is-completed' : ''}" data-id="${b.id}">
        <div class="lib-cover">${b.cover ? `<img src="${b.cover}" alt="" loading="lazy">` : `<div class="cover-ph">${icon('book')}</div>`}<span class="lib-done-badge">✓</span></div>
        <div class="lib-title">${escapeHtml(truncate(b.title, 36))}</div>
        <div class="lib-author">${escapeHtml(truncate(b.author, 28))}</div>
        <div class="lib-actions" aria-label="Book actions">
          <button class="lib-action-btn lib-complete" data-id="${b.id}" type="button" aria-label="${b.completed ? 'Mark as reading' : 'Mark as completed'}" title="${b.completed ? 'Mark as reading' : 'Mark as completed'}">
            ${icon('check')}<span>${b.completed ? 'Reading' : 'Done'}</span>
          </button>
          <button class="lib-action-btn lib-del" data-id="${b.id}" type="button" aria-label="Delete book" title="Delete book">
            ${icon('trash')}<span>Delete</span>
          </button>
        </div>
      </div>`).join('');
    lc.innerHTML = `<div class="lib-grid">${importingHtml}${booksHtml}</div>`;
    attachLibraryBookControls(lc, refresh);
  };
  await refresh();
}

function attachLibraryBookControls(root, refresh) {
  let pressTimer = null;
  let longPressed = false;
  const clearPress = () => { clearTimeout(pressTimer); pressTimer = null; };
  const hideActions = () => root.querySelectorAll('.lib-card.show-actions').forEach(c => c.classList.remove('show-actions'));

  root.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.lib-card')) hideActions();
  });

  root.querySelectorAll('.lib-card').forEach(card => {
    if (card.classList.contains('lib-importing')) return;
    card.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      longPressed = false;
      clearPress();
      pressTimer = setTimeout(() => {
        longPressed = true;
        const willShow = !card.classList.contains('show-actions');
        hideActions();
        card.classList.toggle('show-actions', willShow);
      }, 520);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => card.addEventListener(type, clearPress));
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (longPressed) { longPressed = false; return; }
      if (card.classList.contains('show-actions')) { hideActions(); return; }
      router.navigate(`/read/${card.dataset.id}`);
    });
  });

  root.querySelectorAll('.lib-complete').forEach(btn => btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    hideActions();
    await bookStorage.toggleCompleted(btn.dataset.id);
    refresh();
  }));
  root.querySelectorAll('.lib-del').forEach(d => d.addEventListener('click', async (e) => {
    e.stopPropagation();
    hideActions();
    if (confirm('Delete this book?')) {
      await bookStorage.deleteBook(d.dataset.id);
      refresh();
    }
  }));
}

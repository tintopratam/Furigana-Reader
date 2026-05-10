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
  page.className = 'page';
  page.innerHTML = `<header class="page-header"><h1>Library</h1><div class="header-actions"><button class="btn-icon" id="imp" type="button" aria-label="Import book">${icon('plus')}</button></div></header><div id="lc"><div class="loading-center"><div class="spinner"></div></div></div><input type="file" id="fi" accept="application/epub+zip,.epub" style="display:none" multiple>`;
  container.appendChild(page);
  page.querySelector('#imp').onclick = () => page.querySelector('#fi').click();
  page.querySelector('#fi').onchange = async (e) => {
    for (const f of e.target.files) { try { await bookStorage.addBook(f); } catch (err) { console.error(err); } }
    e.target.value = '';
    refresh();
  };
  const refresh = async () => {
    const lc = page.querySelector('#lc');
    const books = await bookStorage.getAllBooks();
    if (!books.length) { lc.innerHTML = `<div class="empty">${icon('library')}<h3>No books yet</h3><p>Tap + to import a file.</p></div>`; return; }
    books.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
    lc.innerHTML = `<div class="lib-grid">${books.map(b => `
      <div class="lib-card" data-id="${b.id}">
        <div class="lib-cover">${b.cover ? `<img src="${b.cover}" alt="" loading="lazy">` : `<div class="cover-ph">${icon('book')}</div>`}</div>
        <div class="lib-title">${escapeHtml(truncate(b.title, 36))}</div>
        <div class="lib-author">${escapeHtml(truncate(b.author, 28))}</div>
        <button class="lib-del" data-id="${b.id}">${icon('trash')}</button>
      </div>`).join('')}</div>`;
    lc.querySelectorAll('.lib-card').forEach(c => c.addEventListener('click', (e) => { if (!e.target.closest('.lib-del')) router.navigate(`/read/${c.dataset.id}`); }));
    lc.querySelectorAll('.lib-del').forEach(d => d.addEventListener('click', async (e) => { e.stopPropagation(); if (confirm('Delete?')) { await bookStorage.deleteBook(d.dataset.id); refresh(); } }));
  };
  await refresh();
}

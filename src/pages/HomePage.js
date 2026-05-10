/**
 * Home Page v2 — clean, compact
 */
import bookStorage from '../services/BookStorage.js';
import router from '../utils/router.js';
import { icon } from '../utils/icons.js';
import { escapeHtml, truncate } from '../utils/helpers.js';

export async function renderHomePage(container) {
  container.innerHTML = '';
  const page = document.createElement('div');
  page.className = 'page';
  page.innerHTML = `<header class="page-header"><h1>Reader</h1></header><div id="hc"><div class="loading-center"><div class="spinner"></div></div></div>`;
  container.appendChild(page);

  const hc = page.querySelector('#hc');
  const lastRead = await bookStorage.getLastReadBook();
  const recent = await bookStorage.getRecentBooks(6);
  let html = '';

  if (lastRead) {
    const p = lastRead.progress?.percentage ?? 0;
    html += `<section class="home-hero"><div class="section-head"><span class="section-title">Continue Reading</span></div>
      <div class="card hero-card" id="hero" data-id="${lastRead.id}">
        <div class="hero-cover">${lastRead.cover ? `<img src="${lastRead.cover}" alt="">` : `<div class="cover-ph">${icon('book')}</div>`}</div>
        <div class="hero-info">
          <div class="hero-title">${escapeHtml(truncate(lastRead.title, 55))}</div>
          <div class="hero-author">${escapeHtml(lastRead.author || 'Unknown')}</div>
          <div class="hero-prog"><div class="prog-bar" style="flex:1"><div class="prog-fill" style="width:${p}%"></div></div><span class="hero-pct">${Math.round(p)}%</span></div>
        </div>
      </div></section>`;
  }

  if (recent.length) {
    html += `<section><div class="section-head"><span class="section-title">Recent</span><button class="link-btn" id="view-all">All →</button></div>
      <div class="lib-grid">${recent.map(b => `
        <div class="lib-card" data-id="${b.id}">
          <div class="lib-cover">${b.cover ? `<img src="${b.cover}" alt="" loading="lazy">` : `<div class="cover-ph">${icon('book')}</div>`}</div>
          <div class="lib-title">${escapeHtml(truncate(b.title, 28))}</div>
          <div class="lib-author">${escapeHtml(truncate(b.author, 22))}</div>
        </div>`).join('')}
      </div></section>`;
  }

  if (!lastRead && !recent.length) {
    html = `<div class="empty">${icon('book')}<h3>Welcome to Reader</h3><p>Import an EPUB to get started.</p><button class="btn btn-primary" id="go-lib">${icon('plus')} Add Book</button></div>`;
  }

  hc.innerHTML = html;
  hc.querySelector('#hero')?.addEventListener('click', () => router.navigate(`/read/${lastRead.id}`));
  hc.querySelector('#view-all')?.addEventListener('click', () => router.navigate('/library'));
  hc.querySelector('#go-lib')?.addEventListener('click', () => router.navigate('/library'));
  hc.querySelectorAll('.lib-card').forEach(c => c.addEventListener('click', () => router.navigate(`/read/${c.dataset.id}`)));
}

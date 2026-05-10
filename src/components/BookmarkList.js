/**
 * Bookmark List Component — v2 compact drawer
 */
import { icon } from '../utils/icons.js';
import bookStorage from '../services/BookStorage.js';
import { timeAgo, escapeHtml } from '../utils/helpers.js';

export async function showBookmarkList(bookId, onGoTo) {
  const existing = document.querySelector('.r-bm');
  if (existing) { existing.remove(); return; }

  const bookmarks = await bookStorage.getBookmarks(bookId);
  const panel = document.createElement('div');
  panel.className = 'r-bm';
  panel.innerHTML = `
    <div class="r-bm-bg" id="bm-bg"></div>
    <div class="r-bm-drawer">
      <div class="r-bm-head">
        <h3>Bookmarks</h3>
        <button class="btn-icon" id="bm-close">${icon('x')}</button>
      </div>
      <div class="r-bm-list">
        ${bookmarks.length === 0 ? '<div class="r-bm-empty">No bookmarks yet</div>' : bookmarks.map(bm => `
          <div class="r-bm-item" data-location="${escapeHtml(bm.location)}">
            <div class="r-bm-info">
              <div class="r-bm-label">${escapeHtml(bm.label || 'Bookmark')}</div>
              <div class="r-bm-time">${timeAgo(bm.timestamp)}</div>
            </div>
            <button class="r-bm-del" data-id="${bm.id}">${icon('trash')}</button>
          </div>
        `).join('')}
      </div>
    </div>`;

  document.body.appendChild(panel);
  panel.querySelector('#bm-bg').onclick = () => panel.remove();
  panel.querySelector('#bm-close').onclick = () => panel.remove();

  panel.querySelectorAll('.r-bm-item').forEach(item => {
    item.onclick = e => {
      if (e.target.closest('.r-bm-del')) return;
      onGoTo(item.dataset.location);
      panel.remove();
    };
  });

  panel.querySelectorAll('.r-bm-del').forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      await bookStorage.deleteBookmark(btn.dataset.id);
      btn.closest('.r-bm-item').remove();
      if (!panel.querySelector('.r-bm-item')) {
        panel.querySelector('.r-bm-list').innerHTML = '<div class="r-bm-empty">No bookmarks yet</div>';
      }
    };
  });
}

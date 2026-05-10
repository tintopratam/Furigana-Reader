/**
 * Reader Page v2 — All native foliate-js features, no TTS
 * Auto text direction from EPUB, overridable. Paginated/scrolled switch.
 */
import bookStorage from '../services/BookStorage.js';
import settingsService from '../services/SettingsService.js';
import router from '../utils/router.js';
import { icon } from '../utils/icons.js';
import { setBottomNavVisible } from '../components/BottomNav.js';
import { escapeHtml } from '../utils/helpers.js';
import { showBookmarkList } from '../components/BookmarkList.js';
import {
  injectContentHooks, injectFurigana, forEachIframeDoc,
  applyStyles, getLookupMode, setLookupMode
} from './ReaderHelpers.js';
import 'foliate-js/view.js';

let currentBook = null, foliateView = null, epubBook = null;
let controlsVisible = true, keyHandler = null, activeContentDoc = null;
const keyboardDocs = new Set();
let sliderDragging = false, sliderCommitTimer = null;

export async function renderReaderPage(container, params) {
  container.innerHTML = '';
  setBottomNavVisible(false);

  const el = document.createElement('div');
  el.className = 'reader-page';
  el.innerHTML = `
    <div class="r-top" id="r-top">
      <div class="r-top-l">
        <button class="btn-icon" id="btn-back">${icon('back')}</button>
        <span class="r-title" id="r-title">Loading…</span>
      </div>
      <div class="r-top-r">
        <button class="btn-icon" id="btn-hist-b" title="Back" disabled>${icon('back')}</button>
        <button class="btn-icon" id="btn-hist-f" title="Forward" disabled style="transform:scaleX(-1)">${icon('back')}</button>
        <button class="btn-icon" id="btn-search">${icon('search')}</button>
      </div>
    </div>
    <div class="r-body" id="r-body">
      <div id="epub-wrap"></div>
      <div class="tap tap-l" id="tap-l"></div>
      <div class="tap tap-c" id="tap-c"></div>
      <div class="tap tap-r" id="tap-r"></div>
      <button class="r-edge-nav r-edge-prev hide" id="r-edge-prev" title="Previous chapter">${icon('back')}</button>
      <button class="r-edge-nav r-edge-next hide" id="r-edge-next" title="Next chapter">${icon('back')}</button>
    </div>
    <div class="r-bot" id="r-bot">
      <div class="r-slider-row">
        <input type="range" class="r-slider" id="r-slider" min="0" max="1" step="any" value="0"/>
        <span class="r-pct" id="r-pct">0%</span>
      </div>
      <div class="r-actions">
        <button class="r-act" id="btn-toc">${icon('toc')}<span>TOC</span></button>
        <button class="r-act ${settingsService.get('furiganaEnabled') ? 'on' : ''}" id="btn-fg">${icon('furigana')}<span>Furigana</span></button>
        <button class="r-act" id="btn-lk">${icon('lookup')}<span>Lookup</span></button>
        <button class="r-act" id="btn-bm">${icon('bookmark')}<span>Marks</span></button>
        <button class="r-act" id="btn-style">${icon('settings')}<span>Style</span></button>
      </div>
    </div>
    <div class="r-search hide" id="r-search">
      <input type="text" id="s-input" placeholder="Search in book…"/>
      <button class="btn-icon" id="s-close">${icon('x')}</button>
    </div>
    <div class="r-search-results hide" id="s-results"></div>`;
  container.appendChild(el);

  try {
    currentBook = await bookStorage.getBook(params.id);
    if (!currentBook) { router.navigate('/home'); return; }
    document.getElementById('r-title').textContent = currentBook.title;
    await bookStorage.touchBook(params.id);
    await openBook(currentBook);
  } catch (err) {
    document.getElementById('r-body').innerHTML =
      `<div class="empty">${icon('info')}<h3>Could not open book</h3><p>${escapeHtml(err.message)}</p>
       <button class="btn btn-primary" onclick="location.hash='/home'">Go Back</button></div>`;
    return;
  }

  // Reader surface taps only toggle the chrome; Foliate owns page movement/swipe.
  document.getElementById('r-body').onclick = (e) => {
    if (e.target.closest('button, input, .r-top, .r-bot, .r-sheet, .r-search, .r-search-results')) return;
    toggleControls();
  };
  document.getElementById('tap-l').onclick = null;
  document.getElementById('tap-r').onclick = null;
  document.getElementById('tap-c').onclick = toggleControls;
  document.getElementById('r-edge-prev').onclick = () => foliateView?.renderer?.prev?.();
  document.getElementById('r-edge-next').onclick = () => foliateView?.renderer?.next?.();
  document.getElementById('btn-back').onclick = closeReader;

  // Top arrows beside search are chapter controls. Direction adapts to reading mode.
  document.getElementById('btn-hist-b').disabled = false;
  document.getElementById('btn-hist-f').disabled = false;
  document.getElementById('btn-hist-b').onclick = goTopLeftChapter;
  document.getElementById('btn-hist-f').onclick = goTopRightChapter;

  // Slider — debounce navigation to avoid flicker while crossing chapter boundaries.
  const progressSlider = document.getElementById('r-slider');
  progressSlider.onpointerdown = () => { sliderDragging = true; };
  progressSlider.oninput = (e) => {
    const value = parseFloat(e.target.value) || 0;
    const pct = document.getElementById('r-pct');
    if (pct) pct.textContent = Math.round(value * 100) + '%';
    clearTimeout(sliderCommitTimer);
    sliderCommitTimer = setTimeout(() => commitSliderProgress(value), 180);
  };
  progressSlider.onchange = (e) => commitSliderProgress(parseFloat(e.target.value) || 0);
  progressSlider.onpointerup = (e) => commitSliderProgress(parseFloat(e.target.value) || 0);
  progressSlider.onpointercancel = () => { sliderDragging = false; };

  // Furigana toggle
  document.getElementById('btn-fg').onclick = async () => {
    const on = !settingsService.get('furiganaEnabled');
    settingsService.set('furiganaEnabled', on);
    document.getElementById('btn-fg').classList.toggle('on', on);
    if (on) {
      forEachIframeDoc(foliateView, async doc => {
        await injectFurigana(doc.body);
        doc.body.classList.remove('furigana-hidden');
      });
    } else {
      forEachIframeDoc(foliateView, doc => doc.body.classList.add('furigana-hidden'));
    }
  };

  // Lookup toggle
  document.getElementById('btn-lk').onclick = () => {
    const on = !getLookupMode();
    setLookupMode(on);
    document.getElementById('btn-lk').classList.toggle('on', on);
    document.querySelector('.reader-page')?.classList.toggle('lookup-mode', on);
    document.querySelectorAll('.tap').forEach(z => z.style.pointerEvents = on ? 'none' : '');
    forEachIframeDoc(foliateView, doc => doc.body.classList.toggle('lookup-mode', on));
  };

  // Bookmarks
  document.getElementById('btn-bm').onclick = () => {
    if (currentBook) showBookmarkList(currentBook.id, loc => foliateView?.goTo(loc));
  };

  // Search
  document.getElementById('btn-search').onclick = () => {
    document.getElementById('r-search').classList.toggle('hide');
    document.getElementById('s-input').focus();
  };
  document.getElementById('s-close').onclick = () => {
    document.getElementById('r-search').classList.add('hide');
    document.getElementById('s-results').classList.add('hide');
    foliateView?.clearSearch();
  };
  document.getElementById('s-input').onkeydown = async (e) => {
    if (e.key !== 'Enter') return;
    const query = e.target.value.trim();
    if (!query) return;
    const resultsEl = document.getElementById('s-results');
    resultsEl.classList.remove('hide');
    resultsEl.innerHTML = '<div class="sr-msg">Searching…</div>';
    const results = [];
    for await (const item of foliateView.search({ query })) {
      if (item === 'done') break;
      if (item.subitems) for (const sub of item.subitems) results.push({ label: item.label, ...sub });
    }
    if (!results.length) { resultsEl.innerHTML = '<div class="sr-msg">No results</div>'; return; }
    resultsEl.innerHTML = results.slice(0, 50).map((r, i) =>
      `<div class="sr-item" data-idx="${i}"><div class="sr-label">${escapeHtml(r.label || '')}</div><div class="sr-text">${escapeHtml(r.excerpt || '')}</div></div>`
    ).join('');
    resultsEl.querySelectorAll('.sr-item').forEach(item => {
      item.onclick = () => {
        const r = results[+item.dataset.idx];
        if (r.cfi) foliateView.goTo(r.cfi);
        document.getElementById('r-search').classList.add('hide');
        resultsEl.classList.add('hide');
      };
    });
  };

  // TOC & Settings
  document.getElementById('btn-toc').onclick = showTOC;
  document.getElementById('btn-style').onclick = showReaderSettings;

  // Keyboard: catch keys from both the app shell and Foliate iframe docs,
  // then delegate actual movement to Foliate's native navigation APIs.
  keyHandler = (e) => {
    const target = e.target;
    if (target?.closest?.('input, select, textarea, button, [contenteditable="true"]')) return;
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target?.tagName)) return;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;

    if (e.key === 'ArrowLeft' || e.key === 'h') { e.preventDefault(); foliateView?.goLeft(); }
    else if (e.key === 'ArrowRight' || e.key === 'l') { e.preventDefault(); foliateView?.goRight(); }
    else if (e.key === 'ArrowDown' || e.key === 'j' || e.key === ' ') { e.preventDefault(); foliateView?.next(); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); foliateView?.prev(); }
    else if (e.key === 'Escape') closeReader();
  };
  bindKeyboardDoc(document);
}

async function openBook(book) {
  const wrap = document.getElementById('epub-wrap');
  wrap.innerHTML = '';
  if (foliateView) { try { foliateView.close(); } catch {} foliateView.remove(); }

  foliateView = document.createElement('foliate-view');
  foliateView.style.cssText = 'width:100%;height:100%;display:block;';
  wrap.appendChild(foliateView);

  foliateView.addEventListener('load', async ({ detail: { doc } }) => {
    activeContentDoc = doc;
    bindKeyboardDoc(doc);
    injectContentHooks(doc, foliateView);
    doc.addEventListener('click', () => {
      document.querySelector('.r-sheet')?.remove();
      if (getLookupMode() || doc.getSelection()?.toString()) return;
      foliateView.dispatchEvent(new CustomEvent('reader-toggle-controls'));
    });
    doc.addEventListener('scroll', () => updateScrolledEdgeButtons(doc), { passive: true });
    requestAnimationFrame(() => updateScrolledEdgeButtons(doc));
    if (settingsService.get('furiganaFilter') !== 'none') await injectFurigana(doc.body);
  });
  foliateView.addEventListener('reader-toggle-controls', toggleControls);

  foliateView.addEventListener('relocate', ({ detail }) => {
    const { fraction, cfi } = detail;
    const slider = document.getElementById('r-slider');
    const pct = document.getElementById('r-pct');
    if (slider && !sliderDragging) slider.value = fraction ?? 0;
    if (pct && !sliderDragging) pct.textContent = Math.round((fraction ?? 0) * 100) + '%';
    updateScrolledEdgeButtons();
    if (currentBook && cfi) bookStorage.saveProgress(currentBook.id, cfi, (fraction ?? 0) * 100);
  });

  const blob = new Blob([book.data], { type: 'application/epub+zip' });
  const file = new File([blob], book.fileName || 'book.epub', { type: 'application/epub+zip' });
  await foliateView.open(file);
  epubBook = foliateView.book;

  const bs = await bookStorage.getBookSettings(book.id);
  const flow = bs.flow === 'scrolled' ? 'scrolled' : 'paginated';
  foliateView.renderer.setAttribute('flow', flow);
  setRendererLayoutAttrs(flow);
  updateReaderModeClasses(flow);
  applyPageAnimationClass();
  applyNativePageAnimation();

  applyStyles(foliateView);

  // Restore position
  const progress = await bookStorage.getProgress(book.id);
  try {
    if (progress?.location) await foliateView.init({ lastLocation: progress.location });
    else await foliateView.init({ showTextStart: true });
  } catch { try { await foliateView.init({ showTextStart: true }); } catch {} }
  requestAnimationFrame(() => updateScrolledEdgeButtons(activeContentDoc));
}

function toggleControls() {
  controlsVisible = !controlsVisible;
  document.getElementById('r-top')?.classList.toggle('hide', !controlsVisible);
  document.getElementById('r-bot')?.classList.toggle('hide', !controlsVisible);
  if (!controlsVisible) {
    document.getElementById('r-edge-prev')?.classList.add('hide');
    document.getElementById('r-edge-next')?.classList.add('hide');
  } else {
    updateScrolledEdgeButtons(activeContentDoc);
  }
}

function commitSliderProgress(value) {
  clearTimeout(sliderCommitTimer);
  sliderDragging = false;
  foliateView?.goToFraction?.(Math.max(0, Math.min(1, value)));
}


function isVerticalReading() {
  return settingsService.get('textDirection') === 'rtl';
}

function goTopLeftChapter() {
  isVerticalReading()
    ? foliateView?.renderer?.nextSection?.()
    : foliateView?.renderer?.prevSection?.();
}

function goTopRightChapter() {
  isVerticalReading()
    ? foliateView?.renderer?.prevSection?.()
    : foliateView?.renderer?.nextSection?.();
}

function updateScrolledEdgeButtons() {
  const prev = document.getElementById('r-edge-prev');
  const next = document.getElementById('r-edge-next');
  if (!prev || !next) return;

  const renderer = foliateView?.renderer;
  const flow = renderer?.getAttribute?.('flow') || 'paginated';
  const vertical = settingsService.get('textDirection') === 'rtl';

  prev.classList.toggle('vertical-edge', vertical);
  next.classList.toggle('vertical-edge', vertical);
  prev.classList.toggle('horizontal-edge', !vertical);
  next.classList.toggle('horizontal-edge', !vertical);

  const canShow = flow === 'scrolled' && controlsVisible && renderer;
  if (!canShow) {
    prev.classList.add('hide');
    next.classList.add('hide');
    return;
  }

  // In scrolled mode Foliate keeps one EPUB section/chapter loaded at a time.
  // These public renderer getters are already orientation-aware:
  // - horizontal text uses scrollTop/height
  // - vertical text uses scrollLeft/width
  // So this detects section edges without changing paginated behavior.
  const edgeThreshold = 8;
  const start = Number(renderer.start ?? 0);
  const end = Number(renderer.end ?? 0);
  const viewSize = Number(renderer.viewSize ?? 0);
  const size = Number(renderer.size ?? 0);
  const hasScrollableSection = viewSize > size + edgeThreshold;
  const atSectionStart = !hasScrollableSection || start <= edgeThreshold;
  const atSectionEnd = !hasScrollableSection || viewSize - end <= edgeThreshold;

  prev.classList.toggle('hide', !atSectionStart);
  next.classList.toggle('hide', !atSectionEnd);
}

function setRendererLayoutAttrs(flow = 'paginated') {
  if (!foliateView?.renderer) return;
  foliateView.renderer.setAttribute('max-column-count', '1');
  if (flow === 'scrolled') {
    foliateView.renderer.removeAttribute('gap');
    foliateView.renderer.removeAttribute('margin');
    foliateView.renderer.removeAttribute('max-inline-size');
    foliateView.renderer.removeAttribute('max-block-size');
  } else {
    foliateView.renderer.setAttribute('gap', '7%');
    foliateView.renderer.setAttribute('margin', '36px');
    foliateView.renderer.setAttribute('max-inline-size', '720px');
    foliateView.renderer.setAttribute('max-block-size', '1440px');
  }
}

function updateReaderModeClasses(flow = 'paginated') {
  const page = document.querySelector('.reader-page');
  if (!page) return;
  const isScrolled = flow === 'scrolled';
  const isVertical = settingsService.get('textDirection') === 'rtl';
  page.classList.toggle('scrolled', isScrolled);
  page.classList.toggle('vertical-mode', isVertical);
  page.classList.toggle('lookup-mode', getLookupMode());
  applyPageAnimationClass();
}

function applyPageAnimationClass() {
  applyNativePageAnimation();
}

function applyNativePageAnimation() {
  if (!foliateView?.renderer) return;
  const flow = foliateView.renderer.getAttribute?.('flow') || 'paginated';
  const enabled = flow === 'paginated' && settingsService.get('pageTurnAnimation');
  foliateView.renderer.toggleAttribute('animated', !!enabled);
}

let layoutRefreshTimer = null;
async function refreshReaderLayout(flow) {
  if (!foliateView?.renderer) return;
  clearTimeout(layoutRefreshTimer);
  const cfi = foliateView.lastLocation?.cfi;
  setRendererLayoutAttrs(flow || foliateView.renderer.getAttribute('flow'));
  applyStyles(foliateView);
  updateReaderModeClasses(flow || foliateView.renderer.getAttribute('flow'));
  foliateView.renderer.render?.();
  await new Promise(resolve => { layoutRefreshTimer = setTimeout(resolve, 120); });
  try {
    if (cfi) await foliateView.goTo(cfi);
    else foliateView.renderer.render?.();
  } catch {}
}

async function reopenReaderAtCurrentLocation() {
  if (!currentBook) return;
  const cfi = foliateView?.lastLocation?.cfi;
  await openBook(currentBook);
  if (cfi) {
    try { await foliateView.goTo(cfi); } catch {}
  }
}

function bindKeyboardDoc(doc) {
  if (!doc || !keyHandler || keyboardDocs.has(doc)) return;
  doc.addEventListener('keydown', keyHandler);
  keyboardDocs.add(doc);
}

function clearKeyboardDocs() {
  for (const doc of keyboardDocs) {
    try { doc.removeEventListener('keydown', keyHandler); } catch {}
  }
  keyboardDocs.clear();
}

function closeReader() {
  if (keyHandler) { clearKeyboardDocs(); keyHandler = null; }
  if (foliateView) { try { foliateView.close(); } catch {} try { foliateView.remove(); } catch {} foliateView = null; }
  epubBook = null; currentBook = null;
  setBottomNavVisible(true);
  router.navigate('/home');
}

function showTOC() {
  if (!epubBook?.toc?.length) return;
  const panel = document.createElement('div');
  panel.className = 'r-toc';
  const renderItems = (items, depth = 0) => items.map(item => `
    <li class="r-toc-item" style="padding-left:${14 + depth * 18}px" data-href="${item.href}">${escapeHtml(item.label?.trim() || 'Untitled')}</li>
    ${item.subitems?.length ? renderItems(item.subitems, depth + 1).join('') : ''}
  `).join('');
  panel.innerHTML = `
    <div class="r-toc-bg"></div>
    <div class="r-toc-drawer">
      <div class="r-toc-head"><h3>Contents</h3><button class="btn-icon" id="toc-x">${icon('x')}</button></div>
      <ul class="r-toc-list">${renderItems(epubBook.toc)}</ul>
    </div>`;
  document.body.appendChild(panel);
  panel.querySelector('.r-toc-bg').onclick = () => panel.remove();
  panel.querySelector('#toc-x').onclick = () => panel.remove();
  panel.querySelectorAll('.r-toc-item').forEach(li => li.onclick = () => {
    foliateView.goTo(li.dataset.href); panel.remove();
  });
}

function showReaderSettings() {
  const old = document.querySelector('.r-sheet');
  if (old) { old.remove(); return; }
  const s = settingsService.getAll();
  const flow = foliateView?.renderer?.getAttribute?.('flow') || 'paginated';
  const dir = s.textDirection || 'auto';

  const panel = document.createElement('div');
  panel.className = 'r-sheet';
  panel.innerHTML = `<div class="handle"></div>
    <div class="r-sheet-s"><h4>Layout</h4>
      <div class="seg-row">
        <button class="seg-btn ${flow === 'paginated' ? 'on' : ''}" data-flow="paginated">Paginated</button>
        <button class="seg-btn ${flow === 'scrolled' ? 'on' : ''}" data-flow="scrolled">Scrolled</button>
      </div>
    </div>
    <div class="r-sheet-s"><h4>Direction</h4>
      <div class="seg-row">
        <button class="seg-btn ${dir === 'auto' ? 'on' : ''}" data-dir="auto">Auto</button>
        <button class="seg-btn ${dir === 'ltr' ? 'on' : ''}" data-dir="ltr">Horizontal</button>
        <button class="seg-btn ${dir === 'rtl' ? 'on' : ''}" data-dir="rtl">Vertical</button>
      </div>
    </div>

    <div class="r-sheet-s"><h4>Page Animation</h4>
      <div class="seg-row">
        <button class="seg-btn ${s.pageTurnAnimation ? 'on' : ''}" data-page-anim="on">On</button>
        <button class="seg-btn ${!s.pageTurnAnimation ? 'on' : ''}" data-page-anim="off">Off</button>
      </div>
    </div>
    <div class="r-sheet-s"><h4>Theme</h4>
      <div class="seg-row">
        <button class="seg-btn theme-d ${s.theme === 'dark' ? 'on' : ''}" data-theme="dark">Dark</button>
        <button class="seg-btn theme-l ${s.theme === 'light' ? 'on' : ''}" data-theme="light">Light</button>
        <button class="seg-btn theme-s ${s.theme === 'sepia' ? 'on' : ''}" data-theme="sepia">Sepia</button>
      </div>
    </div>
    <div class="r-sheet-s"><h4>Font</h4>
      <select class="sel" id="rs-font">
        <option value="Noto Sans JP" ${s.fontFamily === 'Noto Sans JP' ? 'selected' : ''}>Noto Sans JP</option>
        <option value="Noto Serif JP" ${s.fontFamily === 'Noto Serif JP' ? 'selected' : ''}>Noto Serif JP</option>
        <option value="Inter" ${s.fontFamily === 'Inter' ? 'selected' : ''}>Inter</option>
      </select>
    </div>
    <div class="r-sheet-s"><h4>Size</h4>
      <div class="stp"><button id="fs-d">−</button><span id="fs-v">${s.fontSize}</span><button id="fs-i">+</button></div>
    </div>
    <div class="r-sheet-s"><h4>Spacing</h4>
      <div class="stp"><button id="lh-d">−</button><span id="lh-v">${Math.round(s.lineHeight * 100)}%</span><button id="lh-i">+</button></div>
    </div>`;
  document.body.appendChild(panel);

  // Layout
  panel.querySelectorAll('[data-flow]').forEach(b => b.onclick = () => {
    foliateView.renderer.setAttribute('flow', b.dataset.flow);
    setRendererLayoutAttrs(b.dataset.flow);
    updateReaderModeClasses(b.dataset.flow);
    panel.querySelectorAll('[data-flow]').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    if (currentBook) bookStorage.saveBookSettings(currentBook.id, { flow: b.dataset.flow });
    refreshReaderLayout(b.dataset.flow);
    setTimeout(() => panel.remove(), 80);
  });
  // Direction
  panel.querySelectorAll('[data-dir]').forEach(b => b.onclick = () => {
    settingsService.set('textDirection', b.dataset.dir);
    panel.querySelectorAll('[data-dir]').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    if (currentBook) bookStorage.saveBookSettings(currentBook.id, { textDirection: b.dataset.dir });
    setTimeout(() => panel.remove(), 80);
    reopenReaderAtCurrentLocation();
  });

  // Page animation
  panel.querySelectorAll('[data-page-anim]').forEach(b => b.onclick = () => {
    const enabled = b.dataset.pageAnim === 'on';
    settingsService.set('pageTurnAnimation', enabled);
    panel.querySelectorAll('[data-page-anim]').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    applyPageAnimationClass();
    applyNativePageAnimation();
  });
  // Theme
  panel.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => {
    settingsService.set('theme', b.dataset.theme);
    panel.querySelectorAll('[data-theme]').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    applyStyles(foliateView);
  });
  // Font
  panel.querySelector('#rs-font').onchange = (e) => { settingsService.set('fontFamily', e.target.value); applyStyles(foliateView); };
  // Size
  panel.querySelector('#fs-d').onclick = () => { const c = settingsService.get('fontSize'); if (c > 12) { settingsService.set('fontSize', c - 1); panel.querySelector('#fs-v').textContent = c - 1; applyStyles(foliateView); } };
  panel.querySelector('#fs-i').onclick = () => { const c = settingsService.get('fontSize'); if (c < 36) { settingsService.set('fontSize', c + 1); panel.querySelector('#fs-v').textContent = c + 1; applyStyles(foliateView); } };
  // Spacing
  panel.querySelector('#lh-d').onclick = () => { const c = settingsService.get('lineHeight'); if (c > 1) { const n = Math.round((c - .1) * 10) / 10; settingsService.set('lineHeight', n); panel.querySelector('#lh-v').textContent = Math.round(n * 100) + '%'; applyStyles(foliateView); } };
  panel.querySelector('#lh-i').onclick = () => { const c = settingsService.get('lineHeight'); if (c < 3) { const n = Math.round((c + .1) * 10) / 10; settingsService.set('lineHeight', n); panel.querySelector('#lh-v').textContent = Math.round(n * 100) + '%'; applyStyles(foliateView); } };

  setTimeout(() => {
    const close = (e) => { if (!panel.contains(e.target)) { panel.remove(); document.removeEventListener('click', close); } };
    document.addEventListener('click', close);
  }, 100);
}

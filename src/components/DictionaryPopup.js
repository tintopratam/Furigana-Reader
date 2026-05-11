/**
 * Dictionary Popup Component — v2 Yomiwa-style mini popup + full page
 */
import { icon } from '../utils/icons.js';
import { escapeHtml, isKanji } from '../utils/helpers.js';
import { toRomaji } from '../utils/romaji.js';
import dictionaryService from '../services/DictionaryService.js';

let popupEl = null;

export async function showDictionaryPopup(word, reading = '', context = null, position = null) {
  closeDictionaryPopup();
  const overlay = document.createElement('div');
  overlay.className = `dp-overlay ${position ? 'anchored' : ''}`;
  const popup = document.createElement('div');
  popup.className = 'dp-mini';
  popup.innerHTML = `<div class="dp-loading"><div class="spinner"></div></div>`;
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  if (position) positionMiniPopup(popup, position);
  popupEl = overlay;
  overlay.onclick = e => { if (e.target === overlay) closeDictionaryPopup(); };

  const fallbackWord = [...(word || '').trim()].join('');
  const exactResults = fallbackWord ? await dictionaryService.lookupWord(fallbackWord) : [];
  const analysis = exactResults.length ? null : (context ? await dictionaryService.analyzeAt(context.text, context.index) : null);
  const trimmed = exactResults.length ? fallbackWord : (analysis?.surface || fallbackWord);
  const chars = [...trimmed];
  const singleKanji = !exactResults.length && !analysis && chars.length === 1 && isKanji(chars[0]);
  const results = exactResults.length ? exactResults : (analysis?.results || (singleKanji ? [] : await dictionaryService.lookupWord(trimmed)));
  const kanjiEntry = singleKanji ? await dictionaryService.lookupKanji(trimmed) : null;
  const entry = results[0] || null;
  const entrySpellings = [...(entry?.kanji || []), ...(entry?.kana || [])];
  const displayReading = reading || entry?.kana?.[0] || (singleKanji ? [...(kanjiEntry?.kunyomi || []), ...(kanjiEntry?.onyomi || [])].slice(0, 2).join(' / ') : '');
  const romajiReading = toRomaji(displayReading);
  const displayWord = analysis && entrySpellings.includes(trimmed) ? trimmed : entry?.kanji?.[0] || trimmed;
  const firstSense = entry?.sense?.[0] || null;
  const posLabel = singleKanji ? 'kanji' : (firstSense?.pos?.[0]?.replace(/^.*\s/, '') || '');
  const meanings = singleKanji
    ? kanjiEntry?.meanings?.slice(0, 5)?.join(', ')
    : firstSense?.gloss?.slice(0, 3)?.join(', ') || '';
  const hasKanji = chars.some(isKanji);
  const hasHiragana = chars.some(ch => /[\u3040-\u309F]/.test(ch));
  const hasKatakana = chars.some(ch => /[\u30A0-\u30FFー]/.test(ch));
  const lookupKind = singleKanji
    ? 'single kanji'
    : analysis
      ? hasKanji ? 'analyzed word' : hasKatakana && !hasHiragana ? 'katakana word' : hasHiragana && !hasKatakana ? 'hiragana word' : 'kana word'
      : hasKanji && chars.filter(isKanji).length > 1 ? 'compound word' : hasKatakana && !hasHiragana ? 'katakana word' : hasHiragana && !hasKatakana ? 'hiragana word' : 'word';

  popup.innerHTML = `
    <button class="dp-close" id="dp-close">${icon('x')}</button>
    <div class="dp-mini-head">
      <div>
        ${displayReading ? `<div class="dp-reading">${escapeHtml(displayReading)}</div>` : ''}
        ${romajiReading ? `<div class="dp-romaji">${escapeHtml(romajiReading)}</div>` : ''}
        <div class="dp-word">${escapeHtml(displayWord)}</div>
      </div>
      <div class="dp-mini-badges">
        ${entry?.isCommon ? '<span class="dp-badge common">common</span>' : ''}
        <span class="dp-badge source">JMdict</span>
      </div>
    </div>
    <div class="dp-tags">
      <span class="dp-tag kind">${escapeHtml(lookupKind)}</span>
      ${posLabel ? `<span class="dp-tag pos">${escapeHtml(posLabel)}</span>` : ''}
    </div>
    ${meanings ? `<p class="dp-meaning">${escapeHtml(meanings)}</p>` : `<p class="dp-empty">No definition found. Enable ${singleKanji ? 'KANJIDIC' : 'JMdict'} in Settings.</p>`}
    <button class="dp-expand" id="dp-expand">›</button>`;

  bindTap(popup.querySelector('#dp-close'), () => closeDictionaryPopup());
  bindTap(popup.querySelector('#dp-expand'), () => {
    closeDictionaryPopup();
    showDictionaryFullPage(trimmed, reading, results);
  });
}

function positionMiniPopup(popup, position) {
  requestAnimationFrame(() => {
    const margin = 12;
    const rect = popup.getBoundingClientRect();
    let left = position.x - 24;
    let top = position.y + 26;
    if (left + rect.width > window.innerWidth - margin) left = window.innerWidth - rect.width - margin;
    if (left < margin) left = margin;
    if (top + rect.height > window.innerHeight - margin) top = Math.max(margin, position.y - rect.height - 18);
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  });
}

async function showDictionaryFullPage(word, reading, results = []) {
  const entry = results[0] || null;
  const displayWord = entry?.kanji?.[0] || word;
  const displayReading = reading || entry?.kana?.[0] || '';
  const kanjiChars = [...displayWord].filter(isKanji);
  const singleKanjiDetail = kanjiChars.length === 1 && [...displayWord].length === 1;
  const kanjiDetails = [];
  for (const ch of kanjiChars) {
    const detail = await dictionaryService.lookupKanji(ch);
    if (detail) kanjiDetails.push(detail);
  }
  const compounds = singleKanjiDetail ? await dictionaryService.lookupCompounds(displayWord) : [];
  const sourceStatus = await dictionaryService.getSourceStatus();
  const relatedKeys = [...new Set([word, displayWord, displayReading, ...(entry?.kanji || []), ...(entry?.kana || [])].filter(Boolean))];
  let [wordnetEntries, tanakaEntries, wiktionaryEntries] = await Promise.all([
    sourceStatus.wordnet ? dictionaryService.lookupExternal('wordnet', displayWord, relatedKeys) : [],
    sourceStatus.tanaka ? dictionaryService.lookupExternal('tanaka', displayWord, relatedKeys) : [],
    sourceStatus.wiktionary ? dictionaryService.lookupExternal('wiktionary', displayWord, relatedKeys) : [],
  ]);

  // The bundled WordNet/Wiktionary files can be much smaller than JMdict.
  // If they do not have an exact row for this word, keep the detail page useful
  // by deriving semantic/additional-source cards from the JMdict result.
  if (entry && sourceStatus.wordnet && !wordnetEntries.length) {
    const related = [...new Set([...(entry.kanji || []), ...(entry.kana || [])].filter(v => v && v !== displayWord))];
    wordnetEntries = [{
      id: `jmdict-wordnet-fallback-${displayWord}`,
      word: displayWord,
      definition: firstSense?.gloss?.slice(0, 3)?.join('; ') || '',
      synonyms: related.slice(0, 8),
      semantic: firstSense?.pos?.slice(0, 3)?.join(', ') || 'JMdict semantic category',
      source: 'JMdict fallback',
    }];
  }
  if (entry && sourceStatus.wiktionary && !wiktionaryEntries.length) {
    wiktionaryEntries = entry.sense?.slice(0, 4).map((sense, index) => ({
      id: `jmdict-wiktionary-fallback-${displayWord}-${index}`,
      term: displayWord,
      gloss: sense.gloss?.join('; ') || '',
      description: sense.pos?.join(', ') || 'JMdict definition',
      source: 'JMdict fallback',
    })).filter(item => item.gloss) || [];
  }

  const noteKey = `reader-note:${displayWord}`;
  const savedNote = localStorage.getItem(noteKey) || '';

  const page = document.createElement('div');
  page.className = 'dp-full';
  page.innerHTML = `
    <div class="dp-full-head">
      <button class="dp-full-back" id="dp-back">${icon('back')}</button><h2>Dictionary</h2><div style="width:32px"></div>
    </div>
    <div class="dp-full-body">
      <div class="dp-full-word-s">
        ${displayReading ? `<div class="dp-full-reading">${escapeHtml(displayReading)}</div>` : ''}
        <div class="dp-full-word">${escapeHtml(displayWord)}</div>
      </div>
      <div class="dp-source-row"><span>Sources</span><b>JMdict</b>${kanjiChars.length ? '<b>KANJIDIC</b>' : ''}${sourceStatus.wordnet ? '<b>WordNet</b>' : ''}${sourceStatus.tanaka ? '<b>Tanaka</b>' : ''}${sourceStatus.wiktionary ? '<b>Wiktionary</b>' : ''}</div>
      <div class="dp-sec"><div class="dp-sec-title">Definitions <span>From JMdict</span></div>${entry ? renderDefinitions(entry) : '<p class="dp-full-empty">No definitions found.</p>'}</div>
      ${results.length > 1 ? `<div class="dp-sec"><div class="dp-sec-title">Other matches</div>${results.slice(1, 5).map(renderOtherMatch).join('')}</div>` : ''}
      ${kanjiDetails.length ? `<div class="dp-sec"><div class="dp-sec-title">Kanji <span>From KANJIDIC</span></div>${kanjiDetails.map(renderKanjiCard).join('')}</div>` : ''}
      ${compounds.length ? `<div class="dp-sec"><div class="dp-sec-title">Compounds <span>From JMdict</span></div>${compounds.map(entry => renderCompoundEntry(entry, displayWord)).join('')}</div>` : ''}
      ${sourceStatus.wordnet ? `<div class="dp-sec"><div class="dp-sec-title">Semantic Links <span>WordNet</span></div>${wordnetEntries.length ? wordnetEntries.map(renderExternalEntry).join('') : '<p class="dp-full-empty">No WordNet semantic links found for this word.</p>'}</div>` : ''}
      ${sourceStatus.tanaka ? `<div class="dp-sec"><div class="dp-sec-title">Example Sentences <span>Tanaka Corpus</span></div>${tanakaEntries.length ? tanakaEntries.map(renderExampleEntry).join('') : '<p class="dp-full-empty">No Tanaka example sentences found for this word.</p>'}</div>` : ''}
      ${sourceStatus.wiktionary ? `<div class="dp-sec"><div class="dp-sec-title">Additional Sources <span>Wiktionary / Wikidata</span></div>${wiktionaryEntries.length ? wiktionaryEntries.map(renderExternalEntry).join('') : '<p class="dp-full-empty">No Wiktionary/Wikidata entries found for this word.</p>'}</div>` : ''}
      <div class="dp-sec"><div class="dp-sec-title">Notes</div><textarea class="dp-note-area" id="dp-note" placeholder="Add your notes about this word…">${escapeHtml(savedNote)}</textarea></div>
    </div>`;
  document.body.appendChild(page);
  requestAnimationFrame(() => page.classList.add('open'));
  bindTap(page.querySelector('#dp-back'), () => { page.classList.add('out'); setTimeout(() => page.remove(), 280); });
  page.querySelector('#dp-note').oninput = e => {
    const val = e.target.value.trim();
    if (val) localStorage.setItem(noteKey, val);
    else localStorage.removeItem(noteKey);
  };
  page.querySelectorAll('.dp-kanji-detail').forEach(btn => {
    bindTap(btn, () => openDictionaryDetailFromPage(page, btn.dataset.kanji, ''));
  });
  page.querySelectorAll('.dp-compound').forEach(btn => {
    bindTap(btn, () => openDictionaryDetailFromPage(page, btn.dataset.word, ''));
  });
}

function renderDefinitions(entry) {
  if (!entry.sense?.length) return '<p class="dp-full-empty">No definitions.</p>';
  return entry.sense.map((s, i) => `<div class="dp-def"><div class="dp-def-head"><span class="dp-def-num">${i + 1}</span>${s.pos?.length ? `<span class="dp-def-pos">${escapeHtml(s.pos.join(', '))}</span>` : ''}</div><div class="dp-def-text">${escapeHtml(s.gloss?.join('; ') || '')}</div></div>`).join('');
}

function renderOtherMatch(entry) {
  const word = entry.kanji?.[0] || entry.kana?.[0] || '?';
  const reading = entry.kana?.[0] || '';
  const meaning = entry.sense?.[0]?.gloss?.slice(0, 2)?.join(', ') || '';
  return `<div class="dp-other"><div class="dp-other-word">${escapeHtml(word)}${reading ? `<span class="dp-other-rdg">${escapeHtml(reading)}</span>` : ''}</div><div class="dp-other-mean">${escapeHtml(meaning)}</div></div>`;
}

function renderCompoundEntry(entry, kanji) {
  const word = (entry.kanji || []).find(k => k.includes(kanji) && [...k].length > 1) || entry.kanji?.[0] || entry.kana?.[0] || '?';
  const reading = entry.kana?.[0] || '';
  const meaning = entry.sense?.[0]?.gloss?.slice(0, 3)?.join(', ') || '';
  return `<button type="button" class="dp-other dp-compound" data-word="${escapeHtml(word)}"><div class="dp-other-word">${escapeHtml(word)}${reading ? `<span class="dp-other-rdg">${escapeHtml(reading)}</span>` : ''}</div><div class="dp-other-mean">${escapeHtml(meaning)}</div></button>`;
}

function renderKanjiCard(k) {
  return `<div class="dp-kanji"><div class="dp-kanji-main"><div class="dp-kanji-char">${k.literal}</div><div class="dp-kanji-info"><div class="dp-kanji-rdg">${escapeHtml(k.kunyomi?.join(', ') || '—')} | ${escapeHtml(k.onyomi?.join(', ') || '—')}</div><div class="dp-kanji-mean">${escapeHtml(k.meanings?.slice(0, 5)?.join(', ') || 'N/A')}</div><div class="dp-kanji-meta">${k.grade ? `<span>Grade ${k.grade}</span>` : ''}${k.jlpt ? `<span>JLPT N${k.jlpt}</span>` : ''}${k.strokeCount ? `<span>${k.strokeCount} strokes</span>` : ''}${k.freq ? `<span>Freq #${k.freq}</span>` : ''}</div></div><button type="button" class="dp-kanji-detail" data-kanji="${escapeHtml(k.literal)}" title="Open kanji details">Details ›</button></div></div>`;
}

function renderExternalEntry(entry) {
  const title = entry.word || entry.term || entry.headword || entry.japanese || entry.keys?.[0] || 'Entry';
  const body = entry.definition || entry.meaning || entry.gloss || entry.description || entry.translation || entry.english || entry.synonyms?.join(', ') || '';
  const meta = [entry.semantic, entry.source].filter(Boolean).join(' · ');
  const synonyms = entry.synonyms?.length ? `<div class="dp-other-mean"><b>Related:</b> ${escapeHtml(entry.synonyms.join(', '))}</div>` : '';
  return `<div class="dp-other"><div class="dp-other-word">${escapeHtml(title)}</div>${meta ? `<div class="dp-other-mean"><b>${escapeHtml(meta)}</b></div>` : ''}<div class="dp-other-mean">${escapeHtml(body || JSON.stringify(entry))}</div>${synonyms}</div>`;
}

function renderExampleEntry(entry) {
  const jp = entry.japanese || entry.jp || entry.text || entry.sentence || entry.keys?.[0] || '';
  const en = entry.english || entry.en || entry.translation || entry.meaning || '';
  return `<div class="dp-other"><div class="dp-other-word">${escapeHtml(jp)}</div>${en ? `<div class="dp-other-mean">${escapeHtml(en)}</div>` : ''}</div>`;
}

function bindTap(el, handler) {
  if (!el) return;
  let handledAt = 0;
  const run = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const now = Date.now();
    if (now - handledAt < 320) return;
    handledAt = now;
    handler(event);
  };
  el.addEventListener('pointerup', run);
  el.addEventListener('click', run);
}

async function openDictionaryDetailFromPage(page, word, reading = '') {
  if (!word) return;
  const results = await dictionaryService.lookupWord(word);
  page.classList.add('out');
  setTimeout(() => {
    page.remove();
    showDictionaryFullPage(word, reading, results);
  }, 220);
}

export function closeDictionaryPopup() {
  window.dispatchEvent(new CustomEvent('reader:lookup-cleanup'));
  if (!popupEl) return;
  const closing = popupEl;
  popupEl = null;
  closing.classList.add('out');
  closing.querySelector('.dp-mini')?.classList.add('out');
  setTimeout(() => closing.remove(), 200);
}

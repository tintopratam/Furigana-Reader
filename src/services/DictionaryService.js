/**
 * Dictionary Service — JMdict + KANJIDIC storage and lookup
 * Stores dictionary data in IndexedDB for fast offline lookup
 */
import Dexie from 'dexie';

const dictDB = new Dexie('ReaderDictDB');
dictDB.version(1).stores({
  meta: 'name',
  jmdict: '++id, *kanji, *kana',
  kanjidic: 'literal',
});
dictDB.version(2).stores({
  meta: 'name',
  jmdict: '++id, *kanji, *kana',
  kanjidic: 'literal',
  wordnet: '++id, *keys',
  tanaka: '++id, *keys',
  wiktionary: '++id, *keys',
});

const BUNDLED_PATHS = {
  jmdict: '/dict/jmdict-eng-common.json',
  kanjidic: '/dict/kanjidic2-en.json',
  wordnet: '/dict/wordnet-ja.json',
  tanaka: '/dict/tanaka-corpus.json',
  wiktionary: '/dict/wiktionary-ja.json',
};

const EXTERNAL_SOURCES = {
  wordnet: { label: 'WordNet (JPN/ENG)', url: 'https://bond-lab.github.io/wnja/data/wnjpn.db.gz', path: BUNDLED_PATHS.wordnet },
  tanaka: { label: 'Tanaka Corpus', url: 'https://www.edrdg.org/wiki/index.php/Tanaka_Corpus', path: BUNDLED_PATHS.tanaka },
  wiktionary: { label: 'Wiktionary / Wikidata', url: 'https://en.wiktionary.org/wiki/Wiktionary:Database_download', path: BUNDLED_PATHS.wiktionary },
};

const MAX_ANALYZE_LOOKAROUND = 18;

function normalizeLookupKey(value = '') {
  return [...String(value).trim()]
    .join('')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function keyMatchesLookup(rowKey, lookupKeys) {
  const key = normalizeLookupKey(rowKey);
  if (!key) return false;
  return lookupKeys.some(lookup => {
    const v = normalizeLookupKey(lookup);
    if (!v) return false;
    return key === v || key.includes(v) || v.includes(key);
  });
}

function getEntrySearchText(row = '') {
  return [
    row.word, row.term, row.headword, row.japanese, row.text,
    row.definition, row.meaning, row.gloss, row.description,
    row.translation, row.english,
    ...(row.synonyms || []), ...(row.keys || []),
  ].filter(Boolean).join(' ');
}

function getLookupVariants(word = '') {
  const clean = [...String(word).trim()].join('');
  if (!clean) return [];
  const variants = new Set([clean]);

  const add = v => { if (v && v !== clean) variants.add(v); };
  const rules = [
    ['かった', 'い'], ['くない', 'い'], ['くて', 'い'], ['ければ', 'い'],
    ['でした', 'だ'], ['ではない', 'だ'], ['じゃない', 'だ'],
    ['ました', 'る'], ['ません', 'る'], ['ない', 'る'], ['ます', 'る'],
    ['ませんでした', 'る'], ['なかった', 'る'], ['たかった', 'たい'],
    ['って', 'う'], ['った', 'う'], ['わない', 'う'],
    ['いて', 'く'], ['いた', 'く'], ['かない', 'く'],
    ['いで', 'ぐ'], ['いだ', 'ぐ'], ['がない', 'ぐ'],
    ['して', 'す'], ['した', 'す'], ['さない', 'す'],
    ['んで', 'む'], ['んだ', 'む'], ['まない', 'む'],
    ['んで', 'ぶ'], ['んだ', 'ぶ'], ['ばない', 'ぶ'],
    ['んで', 'ぬ'], ['んだ', 'ぬ'], ['なない', 'ぬ'],
    ['って', 'る'], ['った', 'る'], ['らない', 'る'],
    ['て', 'る'], ['た', 'る'], ['ない', 'る'],
  ];

  for (const [ending, base] of rules) {
    if (clean.endsWith(ending) && clean.length > ending.length) {
      add(clean.slice(0, -ending.length) + base);
    }
  }
  return [...variants];
}

class DictionaryService {
  constructor() {
    this._jmdictCache = null;
    this._kanjidicCache = null;
    this._bundledJmdict = null;
    this._bundledKanjidic = null;
  }

  async isLoaded(name) {
    const meta = await dictDB.meta.get(name);
    return !!meta;
  }

  async getMetadata(name) { return dictDB.meta.get(name); }

  /**
   * Load a bundled dictionary into IndexedDB
   * @param {string} name - 'jmdict' or 'kanjidic'
   * @param {function} onProgress - callback(percent)
   */
  async enable(name, onProgress = () => {}) {
    const path = BUNDLED_PATHS[name];
    if (!path) throw new Error(`Unknown dictionary: ${name}`);

    onProgress(5);
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) {
      const source = EXTERNAL_SOURCES[name];
      if (source) throw new Error(`${source.label} is not bundled yet. Add ${path} to public/dict first.`);
      throw new Error(`Failed to load dictionary: ${response.status}`);
    }
    onProgress(20);

    const data = await response.json();
    onProgress(50);

    if (name === 'jmdict') await this._storeJmdict(data, onProgress);
    else if (name === 'kanjidic') await this._storeKanjidic(data, onProgress);
    else if (EXTERNAL_SOURCES[name]) await this._storeExternalSource(name, data, onProgress);

    onProgress(100);
  }

  async _storeJmdict(data, onProgress) {
    await dictDB.jmdict.clear();
    const words = data.words || [];
    const batchSize = 2000;
    for (let i = 0; i < words.length; i += batchSize) {
      const batch = words.slice(i, i + batchSize).map(entry => ({
        kanji: (entry.kanji || []).map(k => k.text),
        kana: (entry.kana || []).map(k => k.text),
        isCommon: (entry.kanji || []).some(k => k.common) || (entry.kana || []).some(k => k.common),
        sense: (entry.sense || []).map(s => ({
          pos: s.partOfSpeech || [],
          gloss: (s.gloss || []).map(g => g.text),
        })),
      }));
      await dictDB.jmdict.bulkAdd(batch);
      onProgress(50 + Math.round((i / words.length) * 48));
    }
    await dictDB.meta.put({ name: 'jmdict', version: data.version || 'unknown', loadedAt: new Date().toISOString(), entryCount: words.length });
  }

  async _storeKanjidic(data, onProgress) {
    await dictDB.kanjidic.clear();
    const chars = data.characters || [];
    const batchSize = 1000;
    for (let i = 0; i < chars.length; i += batchSize) {
      const batch = chars.slice(i, i + batchSize).map(entry => this._normalizeKanjidicEntry(entry));
      await dictDB.kanjidic.bulkPut(batch);
      onProgress(50 + Math.round((i / chars.length) * 48));
    }
    await dictDB.meta.put({ name: 'kanjidic', version: data.version || 'unknown', loadedAt: new Date().toISOString(), entryCount: chars.length });
  }

  async _storeExternalSource(name, data, onProgress) {
    const table = dictDB[name];
    if (!table) throw new Error(`Missing database table for ${name}`);
    await table.clear();
    const entries = data.entries || data.items || data.sentences || data.words || [];
    const batchSize = 1000;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize).map(entry => {
        const keys = entry.keys || entry.headwords || entry.words || entry.terms || [entry.word, entry.term, entry.japanese, entry.text].filter(Boolean);
        return { ...entry, keys: [...new Set((keys || []).filter(Boolean))] };
      });
      await table.bulkAdd(batch);
      onProgress(50 + Math.round((i / Math.max(entries.length, 1)) * 48));
    }
    await dictDB.meta.put({
      name,
      label: EXTERNAL_SOURCES[name]?.label || name,
      external: true,
      parserReady: true,
      loadedAt: new Date().toISOString(),
      entryCount: entries.length,
      version: data.version || 'custom-json',
    });
  }

  async disable(name) {
    if (name === 'jmdict') { await dictDB.jmdict.clear(); this._jmdictCache = null; }
    else if (name === 'kanjidic') { await dictDB.kanjidic.clear(); this._kanjidicCache = null; }
    else if (dictDB[name]) await dictDB[name].clear();
    await dictDB.meta.delete(name);
  }

  async lookupExternal(name, word, relatedKeys = []) {
    if (!word || !dictDB[name]) return [];
    const jmdictResults = await this.lookupWord(word);
    const jmdictKeys = jmdictResults.flatMap(entry => [...(entry.kanji || []), ...(entry.kana || [])]);
    const baseKeys = [word, ...relatedKeys, ...jmdictKeys, ...getLookupVariants(word)];
    const keys = [...new Set(baseKeys
      .flatMap(key => [key, ...[...String(key)].filter(ch => /[\u4E00-\u9FAF\u3400-\u4DBF]/.test(ch))])
      .map(normalizeLookupKey)
      .filter(Boolean))];
    const byKey = new Map();
    const addRow = (row) => {
      const rowKeys = row.keys || row.headwords || row.words || row.terms || [row.word, row.term, row.japanese, row.text].filter(Boolean);
      const text = getEntrySearchText({ ...row, keys: rowKeys });
      if (!rowKeys.some(key => keyMatchesLookup(key, keys)) && !keyMatchesLookup(text, keys)) return;
      const uniqueKey = row.id ?? `${row.word || row.term || row.japanese || row.text || ''}|${row.definition || row.gloss || row.english || row.translation || ''}`;
      byKey.set(uniqueKey, { ...row, keys: rowKeys });
    };

    if (await this.isLoaded(name)) {
      for (const key of keys) {
        try {
          const rows = await dictDB[name].where('keys').equals(key).toArray();
          rows.forEach(addRow);
        } catch {}
      }
      if (!byKey.size) {
        try {
          const rows = await dictDB[name].filter(row => {
            const rowKeys = row.keys || [];
            const text = getEntrySearchText(row);
            return rowKeys.some(rowKey => keyMatchesLookup(rowKey, keys)) || keyMatchesLookup(text, keys);
          }).limit(80).toArray();
          rows.forEach(addRow);
        } catch {}
      }
    }

    // Always merge bundled JSON too. This fixes stale IndexedDB imports and
    // allows sections to show entries connected by word, reading, kanji, or
    // JMdict spellings/readings.
    const bundled = await this._loadBundledExternal(name);
    bundled.forEach(addRow);

    if (byKey.size && await this.isLoaded(name)) {
      try { await dictDB[name].bulkPut([...byKey.values()]); } catch {}
    }

    return [...byKey.values()].slice(0, 24);
  }

  async _loadBundledExternal(name) {
    const path = BUNDLED_PATHS[name];
    if (!path) return [];
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) return [];
      const data = await response.json();
      const entries = data.entries || data.items || data.sentences || data.words || [];
      return entries.map((entry, idx) => {
        const keys = entry.keys || entry.headwords || entry.words || entry.terms || [entry.word, entry.term, entry.japanese, entry.text].filter(Boolean);
        return { ...entry, id: entry.id ?? `bundled-${name}-${idx}`, keys: [...new Set((keys || []).filter(Boolean))] };
      });
    } catch { return []; }
  }

  async markExternalDownloaded(name) {
    const source = EXTERNAL_SOURCES[name];
    if (!source) throw new Error(`Unknown external source: ${name}`);
    await dictDB.meta.put({
      name,
      label: source.label,
      url: source.url,
      external: true,
      parserReady: false,
      loadedAt: new Date().toISOString(),
      entryCount: 0,
    });
  }

  async getSourceStatus() {
    const metas = await Promise.all([
      this.getMetadata('wordnet'),
      this.getMetadata('tanaka'),
      this.getMetadata('wiktionary'),
    ]);
    return {
      wordnet: !!metas[0], wordnetReady: !!metas[0]?.parserReady,
      tanaka: !!metas[1], tanakaReady: !!metas[1]?.parserReady,
      wiktionary: !!metas[2], wiktionaryReady: !!metas[2]?.parserReady,
    };
  }

  /**
   * Look up a word in JMdict
   */
  async lookupWord(word) {
    if (!word) return [];
    const variants = getLookupVariants(word);
    const findInEntry = entry => variants.some(v => entry.kanji?.includes(v) || entry.kana?.includes(v));

    if (await this.isLoaded('jmdict')) {
      for (const variant of variants) {
        let results = await dictDB.jmdict.where('kanji').equals(variant).limit(10).toArray();
        if (!results.length) results = await dictDB.jmdict.where('kana').equals(variant).limit(10).toArray();
        if (results.length) return results;
      }
      return [];
    }

    const words = await this._loadBundledJmdict();
    return words.filter(findInEntry).slice(0, 10);
  }

  async lookupCompounds(kanji, limit = 24) {
    if (!kanji || !/[\u4E00-\u9FAF\u3400-\u4DBF]/.test(kanji)) return [];
    const rows = await (async () => {
      if (await this.isLoaded('jmdict')) {
        try { return await dictDB.jmdict.filter(entry => (entry.kanji || []).some(k => k.includes(kanji) && [...k].length > 1)).limit(300).toArray(); }
        catch { return []; }
      }
      const words = await this._loadBundledJmdict();
      return words.filter(entry => (entry.kanji || []).some(k => k.includes(kanji) && [...k].length > 1)).slice(0, 300);
    })();

    const seen = new Set();
    return rows
      .sort((a, b) => (b.isCommon === true) - (a.isCommon === true))
      .filter(entry => {
        const word = (entry.kanji || []).find(k => k.includes(kanji) && [...k].length > 1) || entry.kanji?.[0];
        if (!word || seen.has(word)) return false;
        seen.add(word);
        return true;
      })
      .slice(0, limit);
  }

  async _loadBundledJmdict() {
    if (this._bundledJmdict) return this._bundledJmdict;
    const response = await fetch(BUNDLED_PATHS.jmdict);
    if (!response.ok) return [];
    const data = await response.json();
    this._bundledJmdict = (data.words || []).map(entry => ({
      kanji: (entry.kanji || []).map(k => k.text),
      kana: (entry.kana || []).map(k => k.text),
      isCommon: (entry.kanji || []).some(k => k.common) || (entry.kana || []).some(k => k.common),
      sense: (entry.sense || []).map(s => ({
        pos: s.partOfSpeech || [],
        gloss: (s.gloss || []).map(g => g.text),
      })),
    }));
    return this._bundledJmdict;
  }

  /**
   * Yomiwa-style positional analyzer: find dictionary words around a tapped
   * character, prefer entries containing the tap, longest/common first, then
   * fall back to single-kanji lookup in the UI.
   */
  async analyzeAt(text, charIndex = 0) {
    const chars = [...(text || '')];
    if (!chars.length) return null;

    const index = Math.max(0, Math.min(chars.length - 1, charIndex));
    const isJp = ch => /[\u4E00-\u9FAF\u3400-\u4DBF\u3040-\u309F\u30A0-\u30FF々ヶー]/.test(ch);
    if (!isJp(chars[index])) return null;

    let runStart = index;
    let runEnd = index + 1;
    while (runStart > 0 && isJp(chars[runStart - 1]) && index - runStart < MAX_ANALYZE_LOOKAROUND) runStart--;
    while (runEnd < chars.length && isJp(chars[runEnd]) && runEnd - index < MAX_ANALYZE_LOOKAROUND) runEnd++;

    const candidates = [];
    const seen = new Set();
    for (let start = runStart; start <= index; start++) {
      for (let end = index + 1; end <= runEnd; end++) {
        const surface = chars.slice(start, end).join('');
        if (surface.length > 18 || seen.has(surface)) continue;
        seen.add(surface);
        const results = await this.lookupWord(surface);
        if (!results.length) continue;
        const bestEntry = results[0];
        candidates.push({
          surface,
          start,
          end,
          results,
          entry: bestEntry,
          length: [...surface].length,
          isCommon: !!bestEntry.isCommon,
          exactStart: start === index,
        });
      }
    }

    candidates.sort((a, b) => {
      if (a.isCommon !== b.isCommon) return a.isCommon ? -1 : 1;
      if (a.length !== b.length) return b.length - a.length;
      const aCenter = (a.start + a.end - 1) / 2;
      const bCenter = (b.start + b.end - 1) / 2;
      const aDistance = Math.abs(index - aCenter);
      const bDistance = Math.abs(index - bCenter);
      if (aDistance !== bDistance) return aDistance - bDistance;
      return a.start - b.start;
    });

    return candidates[0] || null;
  }

  /**
   * Look up a kanji character in KANJIDIC
   */
  async lookupKanji(char) {
    if (!char) return null;
    if (await this.isLoaded('kanjidic')) {
      const cached = await dictDB.kanjidic.get(char);
      const normalized = cached ? this._normalizeKanjidicEntry(cached) : null;
      const hasReading = !!(normalized?.onyomi?.length || normalized?.kunyomi?.length);
      const hasMeaning = !!normalized?.meanings?.length;
      if (hasMeaning && hasReading) return normalized;

      // Self-healing fallback for old IndexedDB rows created before the
      // kanjidic2-en.json schema was mapped correctly, including rows that
      // have meanings but lost onyomi/kunyomi readings.
      const chars = await this._loadBundledKanjidic();
      const fresh = chars.get(char) || null;
      if (fresh) {
        try { await dictDB.kanjidic.put(fresh); } catch {}
        return fresh;
      }
      return normalized;
    }
    const chars = await this._loadBundledKanjidic();
    return chars.get(char) || null;
  }

  async _loadBundledKanjidic() {
    if (this._bundledKanjidic) return this._bundledKanjidic;
    const response = await fetch(BUNDLED_PATHS.kanjidic);
    if (!response.ok) return new Map();
    const data = await response.json();
    this._bundledKanjidic = new Map((data.characters || []).map(entry => [entry.literal, this._normalizeKanjidicEntry(entry)]));
    return this._bundledKanjidic;
  }

  _normalizeKanjidicEntry(entry) {
    const groups = entry.readingMeaning?.groups || [];
    const readings = groups.flatMap(g => g.readings || []);
    const meanings = groups.flatMap(g => g.meanings || [])
      .filter(m => !m.lang || m.lang === 'en')
      .map(m => typeof m === 'string' ? m : m.value)
      .filter(Boolean);
    const existingMeanings = Array.isArray(entry.meanings) && entry.meanings.length ? entry.meanings : null;
    const existingOnyomi = Array.isArray(entry.readingsOnYomi) && entry.readingsOnYomi.length
      ? entry.readingsOnYomi
      : Array.isArray(entry.readingJa?.onyomi) && entry.readingJa.onyomi.length
        ? entry.readingJa.onyomi
        : Array.isArray(entry.onyomi) && entry.onyomi.length
          ? entry.onyomi
          : null;
    const existingKunyomi = Array.isArray(entry.readingsKunYomi) && entry.readingsKunYomi.length
      ? entry.readingsKunYomi
      : Array.isArray(entry.readingJa?.kunyomi) && entry.readingJa.kunyomi.length
        ? entry.readingJa.kunyomi
        : Array.isArray(entry.kunyomi) && entry.kunyomi.length
          ? entry.kunyomi
          : null;
    return {
      literal: entry.literal,
      meanings: existingMeanings || meanings,
      onyomi: existingOnyomi || readings.filter(r => r.type === 'ja_on').map(r => r.value),
      kunyomi: existingKunyomi || readings.filter(r => r.type === 'ja_kun').map(r => r.value),
      grade: entry.grade || entry.misc?.grade || null,
      strokeCount: entry.strokeCount || entry.misc?.strokeCounts?.[0] || null,
      jlpt: entry.jlptLevel || entry.misc?.jlptLevel || null,
      freq: entry.frequency || entry.misc?.frequency || null,
    };
  }
}

export const dictionaryService = new DictionaryService();
export default dictionaryService;

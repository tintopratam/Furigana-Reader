/**
 * Furigana Engine — Uses kuroshiro + @patdx/kuromoji for Japanese annotation
 * Dictionary files are pre-decompressed .dat files served from /dict/
 */
import settingsService from './SettingsService.js';
import { containsJapanese } from '../utils/helpers.js';

let _kuroshiro = null;
let _initPromise = null;
let _initFailed = false;

class KuromojiAnalyzerAdapter {
  constructor() { this._tokenizer = null; }

  async init() {
    const kuromoji = await import('@patdx/kuromoji');
    const builderFn = kuromoji.builder || kuromoji.default?.builder;
    if (!builderFn) throw new Error('Could not find kuromoji builder function');

    const loader = {
      async loadArrayBuffer(filename) {
        const datFilename = filename.replace('.gz', '');
        const url = '/dict/' + datFilename;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Dict load failed: ${url} (${response.status})`);
        return await response.arrayBuffer();
      }
    };

    this._tokenizer = await builderFn({ loader }).build();
  }

  parse(str = '') {
    if (!this._tokenizer || str.trim() === '') return Promise.resolve([]);
    const tokens = this._tokenizer.tokenize(str);
    return Promise.resolve(tokens.map(t => ({
      surface_form: t.surface_form,
      pos: t.pos || '*',
      pos_detail_1: t.pos_detail_1 || '*',
      pos_detail_2: t.pos_detail_2 || '*',
      pos_detail_3: t.pos_detail_3 || '*',
      conjugated_type: t.conjugated_type || '*',
      conjugated_form: t.conjugated_form || '*',
      basic_form: t.basic_form || t.surface_form,
      reading: t.reading || '',
      pronunciation: t.pronunciation || t.reading || '',
      verbose: { word_id: t.word_id, word_type: t.word_type, word_position: t.word_position },
    })));
  }
}

class FuriganaEngine {
  async _getKuroshiro() {
    if (_kuroshiro) return _kuroshiro;
    if (_initFailed) return null;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
      try {
        const KuroshiroModule = await import('kuroshiro');
        const Kuroshiro = KuroshiroModule.default || KuroshiroModule;
        const instance = new Kuroshiro();
        const analyzer = new KuromojiAnalyzerAdapter();
        await instance.init(analyzer);
        _kuroshiro = instance;
        console.log('✅ Kuroshiro + Kuromoji ready');
        return _kuroshiro;
      } catch (err) {
        _initPromise = null;
        _initFailed = true;
        console.error('Kuroshiro init error:', err);
        return null;
      }
    })();

    return _initPromise;
  }

  async annotate(text) {
    if (!text || typeof text !== 'string' || !containsJapanese(text)) return text;
    const settings = settingsService.getAll();
    if (!settings.furiganaEnabled || settings.furiganaFilter === 'none') return text;

    const kuroshiro = await this._getKuroshiro();
    if (!kuroshiro) return text;

    const to = settings.furiganaMode === 'romaji' ? 'romaji' : 'hiragana';
    try {
      return await kuroshiro.convert(text, { mode: 'furigana', to });
    } catch (e) {
      console.warn('Kuroshiro convert error:', e.message);
      return text;
    }
  }

  async warmup() { await this._getKuroshiro(); }
}

export const furiganaEngine = new FuriganaEngine();
export default furiganaEngine;

/**
 * Book Storage Service — File-based database via @capacitor/filesystem and @capacitor/preferences
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { uid } from '../utils/helpers.js';

export const BOOK_DEFAULTS = {
  flow: 'paginated',
  fontSize: null,
  fontFamily: null,
  fontWeight: null,
  lineHeight: null,
  textAlign: null,
  textDirection: null,
};

class BookStorage {
  constructor() {
    this._books = [];
    this._bookmarks = [];
    this._progress = {};
    this._settings = {};
    this._initPromise = this._init();
  }

  async _init() {
    try {
      const [b, bm, p, s] = await Promise.all([
        Preferences.get({ key: 'reader_books' }),
        Preferences.get({ key: 'reader_bookmarks' }),
        Preferences.get({ key: 'reader_progress' }),
        Preferences.get({ key: 'reader_settings' })
      ]);
      this._books = b.value ? JSON.parse(b.value) : [];
      this._bookmarks = bm.value ? JSON.parse(bm.value) : [];
      this._progress = p.value ? JSON.parse(p.value) : {};
      this._settings = s.value ? JSON.parse(s.value) : {};
    } catch (e) {
      console.warn('Failed to load DB:', e);
    }
  }

  async _saveMetadata() {
    await Promise.all([
      Preferences.set({ key: 'reader_books', value: JSON.stringify(this._books) }),
      Preferences.set({ key: 'reader_bookmarks', value: JSON.stringify(this._bookmarks) }),
      Preferences.set({ key: 'reader_progress', value: JSON.stringify(this._progress) }),
      Preferences.set({ key: 'reader_settings', value: JSON.stringify(this._settings) })
    ]);
  }

  async addBook(file) {
    await this._initPromise;
    const arrayBuffer = await file.arrayBuffer();
    let metadata = { title: file.name.replace(/\.epub$/i, ''), author: 'Unknown' };

    try {
      metadata = await this._extractEpubMeta(arrayBuffer);
    } catch (e) {
      console.warn('Could not extract EPUB metadata:', e);
    }

    const book = {
      id: uid(),
      title: metadata.title || file.name,
      author: metadata.author || 'Unknown',
      fileName: file.name,
      fileSize: file.size,
      cover: metadata.cover || null,
      dateAdded: new Date().toISOString(),
      lastRead: null,
      completed: false,
      completedAt: null,
    };

    // Save actual file to filesystem
    const base64Data = await this._blobToBase64Data(file);
    await Filesystem.writeFile({
      path: `book_${book.id}.epub`,
      data: base64Data,
      directory: Directory.Data
    });

    this._books.push(book);
    await this._saveMetadata();
    return book;
  }

  async getAllBooks() {
    await this._initPromise;
    return [...this._books];
  }

  async getBook(id) {
    await this._initPromise;
    const book = this._books.find(b => b.id === id);
    if (!book) return null;
    
    try {
      if (Capacitor.isNativePlatform()) {
        const uriResult = await Filesystem.getUri({
          path: `book_${book.id}.epub`,
          directory: Directory.Data
        });
        const localUrl = Capacitor.convertFileSrc(uriResult.uri);
        const res = await fetch(localUrl);
        const arrayBuffer = await res.arrayBuffer();
        return { ...book, data: arrayBuffer };
      } else {
        const result = await Filesystem.readFile({
          path: `book_${book.id}.epub`,
          directory: Directory.Data
        });
        const res = await fetch(`data:application/epub+zip;base64,${result.data}`);
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        return { ...book, data: arrayBuffer };
      }
    } catch (e) {
      console.error('Failed to read book file:', e);
      throw new Error('Book file not found or corrupted on device.');
    }
  }

  async deleteBook(id) {
    await this._initPromise;
    this._books = this._books.filter(b => b.id !== id);
    this._bookmarks = this._bookmarks.filter(b => b.bookId !== id);
    delete this._progress[id];
    delete this._settings[id];
    
    try {
      await Filesystem.deleteFile({
        path: `book_${id}.epub`,
        directory: Directory.Data
      });
    } catch (e) {
      console.warn('Failed to delete physical book file:', e);
    }
    await this._saveMetadata();
  }

  async touchBook(id) {
    await this._initPromise;
    const book = this._books.find(b => b.id === id);
    if (book) {
      book.lastRead = new Date().toISOString();
      await this._saveMetadata();
    }
  }

  async markCompleted(id, completed = true) {
    await this._initPromise;
    const book = this._books.find(b => b.id === id);
    if (book) {
      book.completed = Boolean(completed);
      book.completedAt = completed ? new Date().toISOString() : null;
      await this._saveMetadata();
    }
  }

  async toggleCompleted(id) {
    await this._initPromise;
    const book = this._books.find(b => b.id === id);
    if (book) {
      const completed = !book.completed;
      book.completed = completed;
      book.completedAt = completed ? new Date().toISOString() : null;
      await this._saveMetadata();
      return completed;
    }
    return false;
  }

  async saveProgress(bookId, location, percentage) {
    await this._initPromise;
    this._progress[bookId] = {
      bookId,
      location,
      percentage: Math.round(percentage * 100) / 100,
      updatedAt: new Date().toISOString(),
    };
    await Preferences.set({ key: 'reader_progress', value: JSON.stringify(this._progress) });
  }

  async getProgress(bookId) {
    await this._initPromise;
    return this._progress[bookId] || null;
  }

  async getLastReadBook() {
    await this._initPromise;
    const books = [...this._books].filter(b => b.lastRead).sort((a, b) => new Date(b.lastRead) - new Date(a.lastRead));
    if (!books.length) return null;
    const book = books[0];
    const progress = await this.getProgress(book.id);
    return { ...book, progress };
  }

  async getRecentBooks(limit = 10) {
    await this._initPromise;
    return [...this._books].sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded)).slice(0, limit);
  }

  // --- Bookmarks ---
  async addBookmark(bookId, location, label = '') {
    await this._initPromise;
    const bookmark = { id: uid(), bookId, location, label, timestamp: new Date().toISOString() };
    this._bookmarks.push(bookmark);
    await Preferences.set({ key: 'reader_bookmarks', value: JSON.stringify(this._bookmarks) });
    return bookmark;
  }

  async getBookmarks(bookId) {
    await this._initPromise;
    return this._bookmarks.filter(b => b.bookId === bookId);
  }

  async deleteBookmark(id) {
    await this._initPromise;
    this._bookmarks = this._bookmarks.filter(b => b.id !== id);
    await Preferences.set({ key: 'reader_bookmarks', value: JSON.stringify(this._bookmarks) });
  }

  // --- Per-book settings ---
  async getBookSettings(bookId) {
    await this._initPromise;
    const stored = this._settings[bookId] || {};
    return { ...BOOK_DEFAULTS, ...stored };
  }

  async saveBookSettings(bookId, settings) {
    await this._initPromise;
    this._settings[bookId] = { ...(this._settings[bookId] || {}), ...settings, bookId };
    await Preferences.set({ key: 'reader_settings', value: JSON.stringify(this._settings) });
  }

  // --- Internal helpers ---
  async _extractEpubMeta(arrayBuffer) {
    const meta = { title: '', author: '', cover: null };
    try {
      const { makeBook } = await import('foliate-js/view.js');
      const blob = new Blob([arrayBuffer], { type: 'application/epub+zip' });
      const file = new File([blob], 'book.epub', { type: 'application/epub+zip' });
      const book = await makeBook(file);

      meta.title = this._formatLanguageMap(book.metadata?.title) || '';
      meta.author = this._formatContributor(book.metadata?.author) || '';

      try {
        const coverBlob = await book.getCover?.();
        if (coverBlob) meta.cover = await this._blobToBase64DataUrl(coverBlob);
      } catch {}

      book.destroy?.();
    } catch (e) {
      console.warn('EPUB metadata extraction error:', e);
    }
    return meta;
  }

  _formatLanguageMap(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    const keys = Object.keys(value);
    return keys.length ? value[keys[0]] : '';
  }

  _formatContributor(contributor) {
    if (!contributor) return '';
    if (typeof contributor === 'string') return contributor;
    if (Array.isArray(contributor))
      return contributor.map(c => this._formatContributor(c)).filter(Boolean).join(', ');
    return this._formatLanguageMap(contributor.name) || '';
  }

  _blobToBase64DataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  _blobToBase64Data(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

export const bookStorage = new BookStorage();
export default bookStorage;

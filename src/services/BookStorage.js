/**
 * Book Storage Service — IndexedDB via Dexie for books, progress, bookmarks
 */
import Dexie from 'dexie';
import { uid } from '../utils/helpers.js';

const db = new Dexie('ReaderDB');

db.version(1).stores({
  books: 'id, title, author, dateAdded, lastRead',
  bookmarks: 'id, bookId, timestamp',
  progress: 'bookId',
  bookSettings: 'bookId',
});

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
  async addBook(file) {
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
      data: arrayBuffer,
      cover: metadata.cover || null,
      dateAdded: new Date().toISOString(),
      lastRead: null,
      completed: false,
      completedAt: null,
    };

    await db.books.put(book);
    return book;
  }

  async getAllBooks() {
    const books = await db.books.toArray();
    return books.map(b => { const { data, ...meta } = b; return meta; });
  }

  async getBook(id) { return db.books.get(id); }

  async deleteBook(id) {
    await db.books.delete(id);
    await db.progress.delete(id);
    await db.bookmarks.where('bookId').equals(id).delete();
    try { await db.bookSettings.delete(id); } catch {}
  }

  async touchBook(id) {
    await db.books.update(id, { lastRead: new Date().toISOString() });
  }

  async markCompleted(id, completed = true) {
    await db.books.update(id, {
      completed: Boolean(completed),
      completedAt: completed ? new Date().toISOString() : null,
    });
  }

  async toggleCompleted(id) {
    const book = await db.books.get(id);
    const completed = !book?.completed;
    await this.markCompleted(id, completed);
    return completed;
  }

  async saveProgress(bookId, location, percentage) {
    await db.progress.put({
      bookId,
      location,
      percentage: Math.round(percentage * 100) / 100,
      updatedAt: new Date().toISOString(),
    });
  }

  async getProgress(bookId) { return db.progress.get(bookId); }

  async getLastReadBook() {
    const books = await db.books.orderBy('lastRead').reverse().limit(1).toArray();
    if (!books.length || !books[0].lastRead) return null;
    const { data, ...meta } = books[0];
    const progress = await this.getProgress(meta.id);
    return { ...meta, progress };
  }

  async getRecentBooks(limit = 10) {
    const books = await db.books.orderBy('dateAdded').reverse().limit(limit).toArray();
    return books.map(b => { const { data, ...meta } = b; return meta; });
  }

  // --- Bookmarks ---
  async addBookmark(bookId, location, label = '') {
    const bookmark = { id: uid(), bookId, location, label, timestamp: new Date().toISOString() };
    await db.bookmarks.put(bookmark);
    return bookmark;
  }

  async getBookmarks(bookId) {
    return db.bookmarks.where('bookId').equals(bookId).toArray();
  }

  async deleteBookmark(id) { await db.bookmarks.delete(id); }

  // --- Per-book settings ---
  async getBookSettings(bookId) {
    try {
      const stored = await db.bookSettings.get(bookId);
      if (stored) { const { bookId: _, ...settings } = stored; return { ...BOOK_DEFAULTS, ...settings }; }
    } catch {}
    return { ...BOOK_DEFAULTS };
  }

  async saveBookSettings(bookId, settings) {
    const existing = await db.bookSettings.get(bookId);
    await db.bookSettings.put({ ...(existing || {}), ...settings, bookId });
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
        if (coverBlob) meta.cover = await this._blobToBase64(coverBlob);
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

  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

export const bookStorage = new BookStorage();
export default bookStorage;

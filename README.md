# Furigana Reader

A modern Japanese EPUB reader for web and Android, built for learners who want fast furigana, romaji support, and offline dictionary lookup while reading.

## Features

- **EPUB library**: import one or more `.epub` files and keep them in the local library.
- **Foliate-powered reading**: uses `foliate-js` for EPUB parsing, rendering, navigation, and reader layout.
- **Japanese furigana**: generate readings above Japanese text with hiragana or romaji display modes.
- **Dictionary popup**: tap/select Japanese text to view Yomiwa-style word and kanji lookup results.
- **Offline dictionary cache**: bundled dictionary JSON can be cached into IndexedDB for faster offline lookup.
- **Kanji details**: meanings, onyomi, kunyomi, grade, JLPT level, stroke count, and frequency when available.
- **Extra lookup sources**: supports bundled/enhancement data for WordNet, Tanaka Corpus examples, and Wiktionary/Wikidata-style entries.
- **Reader settings**: dark/light/sepia themes, font selection, furigana mode, and furigana color.
- **Android build**: Capacitor Android project included for creating APK releases.

## Tech stack and libraries

- **Vite** - frontend build tool.
- **Vanilla JavaScript, HTML, CSS** - app UI and reader shell.
- **Capacitor** - Android WebView wrapper and APK packaging.
- **foliate-js** - EPUB rendering and reading engine.
- **Dexie** - IndexedDB wrapper for books, settings, progress, and dictionaries.
- **kuroshiro** and **kuroshiro-analyzer-kuromoji** - Japanese reading conversion.
- **@patdx/kuromoji** - tokenizer/analyzer support.
- **wanakana** - kana/romaji conversion helpers.
- **JMdict** and **KANJIDIC** data - Japanese dictionary and kanji data.

## Download

Download the latest Android APK from the GitHub Releases page:

**https://github.com/tintopratam/Furigana-Reader/releases/latest**

Install the APK on Android, then open the app and import your EPUB files from the Library page.

> If Android blocks installation, enable installation from unknown sources for your browser or file manager, then try again.

## How to use

1. Open the app.
2. Go to **Library**.
3. Tap the **+** button and choose one or more `.epub` files.
4. Tap a book cover to start reading.
5. Open **Settings** to change theme, font, furigana mode, or dictionary cache options.
6. Tap/select Japanese text in the reader to open dictionary results.

## Development

### Requirements

- Node.js 18+
- npm
- Java/JDK and Android SDK/Gradle environment for Android builds

### Install dependencies

```bash
npm install
```

### Run in browser

```bash
npm run dev
```

### Build web assets

```bash
npm run build
```

### Sync Android project

```bash
npm run cap:sync
```

### Build Android debug APK

From the `android` directory:

```bash
./gradlew assembleDebug
```

On Windows PowerShell:

```powershell
.\gradlew.bat assembleDebug
```

The generated debug APK is located at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Project structure

```text
src/
  components/       Bottom navigation and shared UI pieces
  pages/            Home, Library, Reader, Settings pages
  services/         Book storage, settings, furigana, dictionary services
  styles/           App, reader, library, settings, dictionary CSS
  utils/            Router, icons, helpers, romaji utilities
public/dict/        Bundled dictionary/tokenizer data
android/            Capacitor Android project
```

## Dictionary data notes

The app includes bundled dictionary assets under `public/dict/`. In Settings, users can cache dictionary data into IndexedDB for faster offline use. Some dictionary/source files are large, so release APK size can be significant.

## License

Add your preferred license before publishing if this project will be distributed publicly.

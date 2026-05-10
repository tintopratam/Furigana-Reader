/**
 * Reader — Main Entry Point
 */
import './styles/index.css';
import './styles/library.css';
import './styles/reader.css';
import './styles/dictionary.css';
import './styles/settings.css';

import router from './utils/router.js';
import settingsService from './services/SettingsService.js';
import { createBottomNav, updateBottomNav, setBottomNavVisible } from './components/BottomNav.js';
import { renderHomePage } from './pages/HomePage.js';
import { renderLibraryPage } from './pages/LibraryPage.js';
import { renderReaderPage } from './pages/ReaderPage.js';
import { renderSettingsPage } from './pages/SettingsPage.js';

const app = document.getElementById('app');
const pageContainer = document.createElement('main');
pageContainer.id = 'page-container';
app.appendChild(pageContainer);

const bottomNav = createBottomNav();
app.appendChild(bottomNav);

router.on('/home', async () => { await renderHomePage(pageContainer); });
router.on('/library', async () => { await renderLibraryPage(pageContainer); });
router.on('/read/:id', async (params) => { await renderReaderPage(pageContainer, params); });
router.on('/settings', async () => { await renderSettingsPage(pageContainer); });

router.after((path) => {
  const routeName = router.getRouteName();
  updateBottomNav(routeName);
  setBottomNavVisible(routeName !== 'read');
  if (routeName !== 'read') settingsService.set('lastRoute', path);
});

settingsService.get('theme');
if (!window.location.hash) window.location.hash = '/home';

// Pre-warm kuromoji in background
import('./services/FuriganaEngine.js').then(mod => mod.furiganaEngine.warmup());

console.log('Reader initialized');

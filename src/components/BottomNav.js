/**
 * Bottom Navigation Component
 */
import { icon } from '../utils/icons.js';
import router from '../utils/router.js';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: 'home', route: '/home' },
  { id: 'library', label: 'Library', icon: 'library', route: '/library' },
  { id: 'settings', label: 'Settings', icon: 'settings', route: '/settings' },
];

let navEl = null;

export function createBottomNav() {
  navEl = document.createElement('nav');
  navEl.className = 'bottom-nav';
  navEl.id = 'bottom-nav';

  navEl.innerHTML = NAV_ITEMS.map(item => `
    <button class="nav-item" id="nav-${item.id}" data-route="${item.route}">
      <span class="nav-icon">${icon(item.icon)}</span>
      <span class="nav-label">${item.label}</span>
    </button>
  `).join('');

  navEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-item');
    if (btn) router.navigate(btn.dataset.route);
  });

  return navEl;
}

export function updateBottomNav(routeName) {
  if (!navEl) return;
  navEl.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.id === `nav-${routeName}`);
  });
}

export function setBottomNavVisible(visible) {
  if (navEl) navEl.classList.toggle('hidden', !visible);
}

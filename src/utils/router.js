/**
 * Hash-based SPA router — lightweight, no dependencies
 */
class Router {
  constructor() {
    this._routes = [];
    this._afterHooks = [];
    this._currentPath = '';
    window.addEventListener('hashchange', () => this._resolve());
    window.addEventListener('load', () => this._resolve());
  }

  on(pattern, handler) {
    const paramNames = [];
    const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    this._routes.push({ pattern, regex: new RegExp(`^${regexStr}$`), paramNames, handler });
    return this;
  }

  after(fn) { this._afterHooks.push(fn); return this; }

  navigate(path) { window.location.hash = path; }

  getRouteName() {
    const path = this._currentPath;
    for (const route of this._routes) {
      if (route.regex.test(path)) {
        return route.pattern.split('/').filter(Boolean)[0];
      }
    }
    return '';
  }

  _resolve() {
    const hash = window.location.hash.slice(1) || '/home';
    this._currentPath = hash;
    for (const route of this._routes) {
      const match = hash.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, i) => { params[name] = match[i + 1]; });
        route.handler(params);
        this._afterHooks.forEach(fn => fn(hash));
        return;
      }
    }
  }
}

export const router = new Router();
export default router;

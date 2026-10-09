// ~30-line hash router: no dependency, works inside Capacitor (file://) and static hosting.
type Params = Record<string, string>;
export interface RouteDef { path: string; component: any; title?: string }

class Router {
  path = $state(location.hash.slice(1) || '/');
  constructor() { addEventListener('hashchange', () => { this.path = location.hash.slice(1) || '/'; scrollTo(0, 0); }); }
  match(routes: RouteDef[]): { route: RouteDef; params: Params } | null {
    const [p] = this.path.split('?');
    for (const route of routes) {
      const keys: string[] = [];
      const re = new RegExp('^' + route.path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
      const m = p.match(re);
      if (m) return { route, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  }
  get query() { return new URLSearchParams(this.path.split('?')[1] ?? ''); }
  go(path: string) { location.hash = path; }
  back() { history.length > 1 ? history.back() : this.go('/'); }
}
export const router = new Router();

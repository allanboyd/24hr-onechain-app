// Which backend the build talks to (set by VITE_API in @btw/api: mock | http).
import { mode } from '@btw/api';
// @btw/api types `mode` as the mock's literal; widen it here.
export const API_MODE = mode as 'mock' | 'http';
export const isMock = API_MODE === 'mock';
/** Demo accounts on the sign-in page: mock mode, local dev, or a demo build (VITE_DEMO=1, set by `pnpm start` / `pnpm share`). */
export const showDemoHelpers = isMock || import.meta.env.DEV || import.meta.env.VITE_DEMO === '1';

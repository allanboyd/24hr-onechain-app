// Which backend the build talks to (set by VITE_API in @btw/api: mock | http).
import { mode } from '@btw/api';
// @btw/api types `mode` as the mock's literal; widen it here.
export const API_MODE = mode as 'mock' | 'http';
export const isMock = API_MODE === 'mock';
/** Demo account helper only in mock mode or local dev builds. */
export const showDemoHelpers = isMock || import.meta.env.DEV;

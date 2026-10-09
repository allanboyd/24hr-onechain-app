// Default implementation for non-Vite runtimes (Node tests). Vite apps alias '@btw/api/client' to
// mock-client.ts or http.ts at build time (see packages/api/vite.mjs).
export * from './mock-client';

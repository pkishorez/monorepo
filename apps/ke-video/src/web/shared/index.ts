/*
 * What the server and the browser both run: the pages, each an Actor with
 * a place in the URL and its own work, and the router read from them; and
 * the door the browser's work goes through to `/api`.
 */
export { Api, ApiError, mediaOf, type Outputs } from './api/index.ts';
export * as Pages from './pages/index.ts';
export { router, type Filter, type Route } from './pages/index.ts';

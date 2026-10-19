import { Suspense, lazy, useSyncExternalStore } from 'react';
import { Start } from '@kestack/kabuki/start';
import { apiLive } from './api/index.ts';
import Document from './document.tsx';
import { DEVTOOLS_META, router } from './pages/index.ts';
import { AppView } from './views/index.ts';
import './styles.css';

/*
 * The Kabuki devtools, in the bottom-right corner, only when the Auth
 * Worker runs locally: the server says so with a `<meta>` it writes from
 * the worker's `url`, and only then does the browser load their code, a
 * chunk of its own. A server never draws them, so hydrating draws nothing
 * and they come in right after.
 */
const FloatingDevtools = import.meta.env.SSR
  ? () => null
  : lazy(() =>
      import('@kestack/kabuki/devtools').then((module) => ({
        default: module.FloatingDevtools,
      })),
    );

const never = () => () => {};
const local = () =>
  document.querySelector(`meta[name="${DEVTOOLS_META}"]`) !== null;

function Devtools() {
  const runtime = Start.useRuntime();
  const shown = useSyncExternalStore(never, local, () => false);
  return shown && runtime ? (
    <Suspense fallback={null}>
      <FloatingDevtools runtime={runtime} />
    </Suspense>
  ) : null;
}

function WithDevtools({ children }: Start.DocumentProps) {
  return (
    <Document>
      {children}
      <Devtools />
    </Document>
  );
}

/** The Auth Worker's pages: drawn by the worker, carried on in the browser. */
export default Start.app(router, AppView, {
  document: WithDevtools,
  layer: apiLive,
});

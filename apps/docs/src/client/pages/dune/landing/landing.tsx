import { THEME } from '../theme/index.ts';
import { Api } from './api.tsx';
import { Footer, TopBar } from './chrome.tsx';
import { Hero } from './hero.tsx';
import { How } from './how.tsx';

/*
 * dune's landing page, dark, as the lighting looks best: what it is beside
 * a real app drawn through it, how it works in three steps, then its API
 * by example and in full.
 */

export function Landing() {
  return (
    <div
      style={THEME}
      className="dark min-h-dvh bg-(--dn-page) text-(--dn-text-2) antialiased"
    >
      <TopBar />
      <main>
        <Hero />
        <How />
        <Api />
      </main>
      <Footer />
    </div>
  );
}

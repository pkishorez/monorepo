/** One playground: a route with a title and a line saying what it shows. */
export interface Page {
  readonly path: string;
  readonly title: string;
  readonly summary: string;
}

export interface Chapter {
  readonly id: string;
  readonly title: string;
  /** The promise a PWA makes, in the words the home page uses. */
  readonly promise: string;
  readonly pages: ReadonlyArray<Page>;
  /** Kept out of the swipe and prev/next order: dense benches, not lessons. */
  readonly aside?: boolean;
}

/**
 * Every page, grouped by what a PWA promises. The nav, the home page,
 * prev/next links, swipe paging and view-transition direction all read it.
 */
export const chapters: ReadonlyArray<Chapter> = [
  {
    id: 'install',
    title: 'Install',
    promise: 'It installs like an app.',
    pages: [
      {
        path: '/install',
        title: 'Install prompt',
        summary: 'Offer the install at the right moment, or show iOS the way.',
      },
    ],
  },
  {
    id: 'offline',
    title: 'Offline',
    promise: 'It opens without a network.',
    pages: [
      {
        path: '/runtime-cache',
        title: 'Caching strategies',
        summary:
          'Four ways to answer a request, and where each answer came from.',
      },
      {
        path: '/data',
        title: 'Route data',
        summary: 'A loader that still has data with the network gone.',
      },
      {
        path: '/offline',
        title: 'Offline page',
        summary: 'What a page nobody cached shows with no network.',
      },
      {
        path: '/auth-sim',
        title: 'Never cached',
        summary:
          'A session the worker refuses to keep, and sign-out that wipes.',
      },
    ],
  },
  {
    id: 'updates',
    title: 'Updates',
    promise: 'It updates itself, and asks first.',
    pages: [
      {
        path: '/update',
        title: 'Update prompt',
        summary: 'A new build waits for consent, then every tab moves at once.',
      },
    ],
  },
  {
    id: 'worker',
    title: 'The worker',
    promise: 'A script between the page and the network runs all of it.',
    pages: [
      {
        path: '/status',
        title: 'Inspector',
        summary: 'The build, the worker’s lifecycle, storage and every cache.',
      },
      {
        path: '/rpc',
        title: 'Worker RPC',
        summary:
          'Call into the worker, stream from it, and catch version skew.',
      },
    ],
  },
  {
    id: 'gestures',
    title: 'Gestures',
    promise: 'It answers to your fingers like a native app.',
    pages: [
      {
        path: '/gestures',
        title: 'How gestures work',
        summary: 'Zones, recognizers and patterns: three layers, one touch.',
      },
      {
        path: '/gestures/sidebar',
        title: 'Sidebar',
        summary: 'A drawer that follows the finger and settles by momentum.',
      },
      {
        path: '/gestures/pull-to-refresh',
        title: 'Pull to refresh',
        summary:
          'Pull with resistance, arm past a distance, hold while it works.',
      },
      {
        path: '/gestures/swipe',
        title: 'Swipe',
        summary: 'One direction, a finger count and a rule for when it counts.',
      },
      {
        path: '/gestures/zones',
        title: 'Zones',
        summary: 'Who hears a touch: nesting, trapping and every finger.',
      },
    ],
  },
  {
    id: 'deep-dives',
    title: 'Deep dives',
    promise: 'Benches for testing every edge case.',
    aside: true,
    pages: [
      {
        path: '/gestures/lab',
        title: 'Gesture Lab',
        summary: 'Ten cases of nested zones and trapping, every finger logged.',
      },
      {
        path: '/gestures/swipe-lab',
        title: 'Swipe Lab',
        summary: 'Nine useSwipe cases, each Swipe traced against its rule.',
      },
      {
        path: '/motion',
        title: 'Motion 101',
        summary: 'Velocity, springs, momentum and bounds, as a course.',
      },
    ],
  },
];

/** The lessons in reading order: what swiping and prev/next walk through. */
export const readingOrder: ReadonlyArray<Page> = chapters.flatMap((c) =>
  c.aside === true ? [] : c.pages,
);

export const chapterOf = (path: string): Chapter | undefined =>
  chapters.find((c) => c.pages.some((p) => p.path === path));

export const pageAt = (path: string): Page | undefined =>
  chapters.flatMap((c) => c.pages).find((p) => p.path === path);

/** Position in reading order; the home page is -1, anything else null. */
export const readingIndex = (path: string): number | null => {
  if (path === '/') return -1;
  const index = readingOrder.findIndex((p) => p.path === path);
  return index === -1 ? null : index;
};

/** The pages before and after `path`; home comes before the first. */
export const neighbours = (
  path: string,
): { readonly prev?: Page; readonly next?: Page } => {
  const index = readingIndex(path);
  if (index === null) return {};
  const home: Page = { path: '/', title: 'What is a PWA', summary: '' };
  return {
    prev: index === -1 ? undefined : (readingOrder[index - 1] ?? home),
    next: readingOrder[index + 1],
  };
};

/**
 * View-transition types for a route change, for the router's
 * `defaultViewTransition`: `forward` deeper into the reading order, `back`
 * toward home. `false` skips it: the first render, a reload of the same page,
 * or reduced motion. styles.css keys the animations off these types.
 */
export const viewTransitionTypes = (change: {
  readonly fromLocation?: { readonly pathname: string };
  readonly toLocation: { readonly pathname: string };
  readonly pathChanged: boolean;
}): Array<string> | false => {
  if (change.fromLocation === undefined || !change.pathChanged) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return false;
  }
  const from = readingIndex(change.fromLocation.pathname);
  const to = readingIndex(change.toLocation.pathname);
  if (from === null || to === null) return ['fade'];
  return [to > from ? 'forward' : 'back'];
};

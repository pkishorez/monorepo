// jsdom has no media queries: every test runs on a wide screen, with a mouse.
if (typeof window !== 'undefined')
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;

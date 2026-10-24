import { useCallback, useEffect, useState } from 'react';

/*
 * Which of the page's two versions is showing: `cloud`, the default, or
 * `journey`, where a comet runs through the field and a rail counts the
 * chapters. It lives in the URL as `?v=journey`. The server always draws
 * `cloud`; the browser reads the URL after it hydrates, so the two agree.
 */

export const VARIANTS = ['cloud', 'journey'] as const;
export type Variant = (typeof VARIANTS)[number];

const read = (): Variant =>
  new URLSearchParams(window.location.search).get('v') === 'journey'
    ? 'journey'
    : 'cloud';

const write = (variant: Variant) => {
  const url = new URL(window.location.href);
  if (variant === 'cloud') url.searchParams.delete('v');
  else url.searchParams.set('v', variant);
  window.history.replaceState(window.history.state, '', url);
};

export function useVariant() {
  const [variant, setVariant] = useState<Variant>('cloud');
  useEffect(() => setVariant(read()), []);
  const choose = useCallback((next: Variant) => {
    write(next);
    setVariant(next);
  }, []);
  return [variant, choose] as const;
}

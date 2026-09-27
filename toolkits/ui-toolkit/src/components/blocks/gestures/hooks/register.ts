import { useEffect, useRef } from 'react';
import type { Hub } from '../provider';
import type { HoldOption, Registration } from '../registry';

/** The options every hook takes. */
export type Common = {
  /** Acting fingers, not counting the Hold: 1 by default. */
  readonly fingers?: 1 | 2;
  /** The Hold it answers: `none` by default; `any` is either side. */
  readonly hold?: HoldOption;
  readonly enabled?: boolean;
};

/** The latest value, for handlers that run between renders. */
export const useLatest = <T>(value: T) => {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
};

/**
 * Registers a hook with its zone on mount and removes it on unmount. Only
 * `key` changing registers it again; everything else is read through
 * `build`'s closures at gesture time. Returns the registration once added.
 */
export const useRegistration = (
  hub: Hub,
  key: ReadonlyArray<string | number | boolean>,
  build: () => Registration,
) => {
  const current = useRef<Registration | undefined>(undefined);
  const make = useLatest(build);
  useEffect(() => {
    const registration = make.current();
    current.current = registration;
    const remove = hub.registry.add(registration);
    return () => {
      remove();
      current.current = undefined;
    };
    // The key is the registration's identity; `build` is read fresh.
  }, [hub, make, ...key]);
  return current;
};

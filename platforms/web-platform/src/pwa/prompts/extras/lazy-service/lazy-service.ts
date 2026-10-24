import * as Context from 'effect/Context';
import type * as Layer from 'effect/Layer';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import { useEffect, useState } from 'react';

/**
 * A hook for one page-wide service, built in the browser when the first
 * component using it mounts and kept for the life of the page, so every
 * caller shares it. `undefined` during SSR and until it is built.
 */
export const lazyService = <I, S>(
  key: Context.Key<I, S>,
  layer: Layer.Layer<I>,
): (() => S | undefined) => {
  let service: S | undefined;
  let building: Promise<S> | undefined;
  const build = () =>
    (building ??= ManagedRuntime.make(layer)
      .context()
      .then((context) => (service = Context.get(context, key))));

  return () => {
    const [value, setValue] = useState(service);
    useEffect(() => {
      if (value !== undefined) return;
      let mounted = true;
      build().then(
        (built) => mounted && setValue(built),
        (error: unknown) =>
          console.error('pwa-toolkit: extra failed to start', error),
      );
      return () => {
        mounted = false;
      };
    }, [value]);
    return value;
  };
};

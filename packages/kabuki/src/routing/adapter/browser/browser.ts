import { Layer } from 'effect';
import { Adapter, KEY, keyIn } from '../index.ts';

const CHANGED = '@kestack/kabuki/routing:changed';

/**
 * The browser's own history, for an app that owns the address: the whole
 * site, or everything under its base.
 */
export const browser = () =>
  Layer.sync(Adapter, () => {
    const tell = () => dispatchEvent(new Event(CHANGED));
    return {
      url: () => `${location.pathname}${location.search}`,
      key: () => keyIn(history.state),
      listen: (changed) => {
        addEventListener('popstate', changed);
        addEventListener(CHANGED, changed);
        return () => {
          removeEventListener('popstate', changed);
          removeEventListener(CHANGED, changed);
        };
      },
      push: (url, key) => {
        history.pushState({ [KEY]: key }, '', url);
        tell();
      },
      replace: (url, key) => {
        history.replaceState({ [KEY]: key }, '', url);
        tell();
      },
      go: (by) => history.go(by),
      leave: (url) => location.assign(url),
    };
  });

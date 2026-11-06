import { View } from '@kestack/kabuki/react';
import { useSyncExternalStore } from 'react';
import { Pages } from '../../shared/index.ts';
import { Playground } from './playground.tsx';

const never = () => () => {};

/**
 * The playground page, full screen. Canvases and shaders live in the
 * browser alone, so the server draws an empty dark page.
 */
export const PlaygroundView = View.make(Pages.PlaygroundLive, () => {
  const browser = useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
  return browser ? <Playground /> : <div className="h-dvh bg-[#030405]" />;
});

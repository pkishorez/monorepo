import type { Start } from '@kestack/kabuki/start';
import { Document as WebDocument } from '@kestack/web-platform/start';
import { Devtools, Theme } from './components/index.ts';

/**
 * The HTML around the app: the Web Platform's Document, which sets Inter,
 * the Theme and the device before the first paint, with Kabuki's devtools
 * around the page, from the button in the corner: its Timeline lists
 * every gesture as a Message.
 */
export default function Document({ children }: Start.DocumentProps) {
  return (
    <WebDocument theme={Theme}>
      <Devtools>{children}</Devtools>
    </WebDocument>
  );
}

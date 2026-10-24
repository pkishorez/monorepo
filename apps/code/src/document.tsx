import type { Start } from '@kestack/kabuki/start';
import { Pwa, PwaHead } from '@kestack/web-platform/pwa';
import { Document as WebDocument } from '@kestack/web-platform/app/document';
import { Theme } from './ui/theme/index.ts';

/**
 * The HTML around the app: the Web Platform's Document, which sets Inter
 * and the Theme before the first paint, with the PWA's head and prompts.
 */
export default function Document({ children }: Start.DocumentProps) {
  return (
    <WebDocument
      theme={Theme}
      head={
        <>
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <PwaHead />
        </>
      }
    >
      <Pwa>{children}</Pwa>
    </WebDocument>
  );
}

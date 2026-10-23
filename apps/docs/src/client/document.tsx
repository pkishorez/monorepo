import type { Start } from '@kestack/kabuki/start';
import { Document as WebDocument } from '@kestack/web-platform/start';
import { Theme } from './components/index.ts';

/**
 * The HTML around the app: the Web Platform's Document, which sets Inter,
 * the Theme and the device before the first paint, with the site's icons.
 */
export default function Document({ children }: Start.DocumentProps) {
  return (
    <WebDocument
      theme={Theme}
      head={
        <>
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link
            rel="icon"
            type="image/png"
            sizes="96x96"
            href="/favicon-96x96.png"
          />
          <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        </>
      }
    >
      {children}
    </WebDocument>
  );
}

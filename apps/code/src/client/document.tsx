import type { Start } from '@kestack/kabuki/start';
import { Document as WebDocument } from '@kestack/web-platform/start';
import { Theme } from './components/index.ts';

/** The HTML around the app: the Web Platform's Document, which sets Inter and the Theme before the first paint. */
export default function Document({ children }: Start.DocumentProps) {
  return <WebDocument theme={Theme}>{children}</WebDocument>;
}

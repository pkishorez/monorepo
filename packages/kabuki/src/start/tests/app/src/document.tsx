import { Start } from '../../../app/index.ts';
import type { DocumentProps } from '../../../app/index.ts';

export default function Document({ children }: DocumentProps) {
  return (
    <html lang="en">
      <head>
        <Start.Head />
      </head>
      <body>
        {children}
        <Start.Scripts />
      </body>
    </html>
  );
}

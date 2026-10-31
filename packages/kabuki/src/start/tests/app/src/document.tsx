import { Start } from '../../../app/index.ts';

export default function Document({ children }: Start.DocumentProps) {
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

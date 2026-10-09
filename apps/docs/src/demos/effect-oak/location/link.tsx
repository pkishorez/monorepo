import type { MouseEvent, ReactNode } from 'react';

/*
 * A link to a demo path. It is a real `<a href="#/…">`, so it can be opened
 * in a new tab or copied; a plain click is handed to `onNavigate` instead,
 * which Sends a Message. Foldkit intercepts every link as `ClickedLink`; here
 * each View says where its links go.
 */
export const Link = ({
  to,
  onNavigate,
  className,
  current = false,
  children,
}: {
  readonly to: string;
  readonly onNavigate: (path: string) => void;
  readonly className?: string;
  readonly current?: boolean;
  readonly children: ReactNode;
}) => {
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    const modified =
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey;
    if (modified) return;
    event.preventDefault();
    onNavigate(to);
  };
  return (
    <a
      href={`#${to}`}
      className={className}
      aria-current={current ? 'page' : undefined}
      onClick={click}
    >
      {children}
    </a>
  );
};

import { useCallback, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { css } from './styles.gen.ts';

/*
 * Where the devtools are drawn: a shadow root of their own, holding their
 * stylesheet, so the page's styles never reach them and theirs never reach
 * the page. The host is an element of the page: its `className` and `style`
 * place and size it, and, outside winning over inside, paint over the
 * ground it is given. The page's `color-scheme` comes in, as it inherits.
 * A server draws the host alone; the browser fills it.
 */

/** The ground of a host that fills what holds it, under whatever the page gives it. */
const GROUND =
  ':host{width:100%;height:100%;background-color:var(--background)}';

export function Shadow({
  ground = false,
  className,
  style,
  children,
}: {
  /** Fill what holds it, on the devtools' background. */
  readonly ground?: boolean;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly children: ReactNode;
}) {
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  const host = useCallback((element: HTMLDivElement | null) => {
    if (element)
      setRoot(element.shadowRoot ?? element.attachShadow({ mode: 'open' }));
  }, []);
  return (
    <div ref={host} data-kabuki-devtools="" className={className} style={style}>
      {root &&
        createPortal(
          <>
            <style>{css}</style>
            {ground && <style>{GROUND}</style>}
            {children}
          </>,
          root,
        )}
    </div>
  );
}

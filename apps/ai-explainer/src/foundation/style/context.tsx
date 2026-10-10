import { createContext, use, type ReactNode } from 'react';
import { styles, type Style, type StyleName } from './style.ts';

const StyleContext = createContext<Style>(styles.paper);

export const useStyle = () => use(StyleContext);

// Paints everything inside it in one Style: its theme variables reach kui
// components and the board as well as the Walkthrough's own cards.
export function StyleProvider({
  name,
  children,
}: {
  name: StyleName;
  children: ReactNode;
}) {
  const style = styles[name];
  return (
    <StyleContext value={style}>
      <div
        className="absolute inset-0 bg-background text-foreground"
        style={{ ...style.vars, fontFamily: style.font.body }}
      >
        {children}
      </div>
    </StyleContext>
  );
}

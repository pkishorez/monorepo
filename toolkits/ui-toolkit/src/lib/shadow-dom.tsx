import React, {
  useLayoutEffect,
  useRef,
  useState,
  createContext,
  useContext,
} from 'react';
import { createPortal } from 'react-dom';

interface ShadowScopeProps extends React.HTMLAttributes<HTMLDivElement> {
  css: string; // Raw CSS string
  children: React.ReactNode;
  theme?: 'dark' | 'light';
}

interface ShadowScopeContext {
  shadowRoot: ShadowRoot | null;
  portalContainer: HTMLDivElement | null;
  theme?: 'dark' | 'light';
}

const ShadowScopeContext = createContext<ShadowScopeContext>({
  shadowRoot: null,
  portalContainer: null,
  theme: 'dark',
});

export const useShadowScope = () => useContext(ShadowScopeContext);

export const ShadowScope = ({
  css,
  children,
  className,
  theme = 'dark',
  style,
  ...props
}: ShadowScopeProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null,
  );

  // 1. Initialize Shadow DOM (Runs once)
  useLayoutEffect(() => {
    if (hostRef.current && !shadowRoot) {
      const root = hostRef.current.attachShadow({ mode: 'open' });
      setShadowRoot(root);
    }
  }, []);

  // 2. Sync Styles (Runs on mount + whenever css string changes)
  useLayoutEffect(() => {
    if (shadowRoot) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      shadowRoot.adoptedStyleSheets = [sheet];
    }
  }, [shadowRoot, css]);

  // 3. Render
  // We render the HOST div, but portal the children INSIDE the shadow root.
  // Wrap in a div with className/style so portaled content (dropdowns) inherit theme.
  return (
    <div ref={hostRef}>
      {shadowRoot && (
        <ShadowScopeContext.Provider
          value={{ shadowRoot, portalContainer, theme }}
        >
          {createPortal(
            <div
              {...props}
              ref={setPortalContainer}
              className={className}
              style={style}
              data-ktheme={theme}
            >
              {children}
            </div>,
            shadowRoot,
          )}
        </ShadowScopeContext.Provider>
      )}
    </div>
  );
};

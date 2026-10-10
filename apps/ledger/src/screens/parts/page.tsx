import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

// Tailwind's @3xl, in rem: where a Place has room for two columns.
const WIDE = 48;

const WideContext = createContext(false);

/**
 * The page every Place is drawn in, and the container its layout answers
 * to: a Place sizes itself with `@md:` and the like against the room it
 * has beside the sidebar, never against the window.
 */
export function Page(props: { readonly children: ReactNode }) {
  const page = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const element = page.current;
    if (element === null) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWide(entry.contentRect.width >= WIDE * rem);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={page}
      data-page=""
      tabIndex={-1}
      className="@container/page flex-1 outline-none"
    >
      <WideContext value={wide}>{props.children}</WideContext>
    </div>
  );
}

/** Whether the page has room for two columns, as `@3xl:` does in CSS. */
export const useWide = () => useContext(WideContext);

/** Gives the keyboard's focus to the page, as when the Sidebar lets go. */
export const focusPage = () =>
  document
    .querySelector<HTMLElement>('[data-page]')
    ?.focus({ preventScroll: true });

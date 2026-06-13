import { useEffect, useId, useRef, useState } from 'react';

import { CodeBlock } from '../code-block';

interface MermaidDiagramProps {
  /** Raw mermaid diagram source (the body of a ```mermaid fence). */
  code: string;
}

/** Tracks whether the app is currently in dark mode by watching `<html>`. */
function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() => readDark());

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setIsDark(readDark()));
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

/** Reads the current dark state from the document root attributes/classes. */
function readDark(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  return (
    root.classList.contains('dark') ||
    root.getAttribute('data-theme') === 'dark'
  );
}

/**
 * Resolves a CSS color string (e.g. the app's `oklch(...)` tokens) to a concrete
 * `#rrggbb`/`rgba(...)` string via a canvas, which normalizes any CSS color.
 * Mermaid's colour math can't parse `oklch`, so tokens must be resolved first.
 */
function resolveColor(value: string): string {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return value;
  ctx.fillStyle = '#000000';
  ctx.fillStyle = value;
  return ctx.fillStyle;
}

/** Reads a shadcn design token off `<html>` and resolves it to a usable color. */
function token(name: string): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return raw ? resolveColor(raw) : '';
}

/**
 * Builds mermaid `base`-theme overrides from the app's live shadcn design tokens
 * (read off `<html>` at render time, so it tracks the active light/dark theme).
 * Maps surfaces/text/borders onto the diagram so it matches the surrounding UI
 * instead of mermaid's stock palette.
 */
function themeVariables(): Record<string, string> {
  const card = token('--card');
  const foreground = token('--foreground');
  const muted = token('--muted');
  const mutedForeground = token('--muted-foreground');
  const border = token('--border');
  const secondary = token('--secondary');

  return {
    background: 'transparent',
    primaryColor: secondary,
    primaryBorderColor: border,
    primaryTextColor: foreground,
    lineColor: mutedForeground,
    textColor: foreground,
    actorBkg: secondary,
    actorBorder: border,
    actorTextColor: foreground,
    actorLineColor: border,
    signalColor: mutedForeground,
    signalTextColor: foreground,
    labelBoxBkgColor: muted,
    labelBoxBorderColor: border,
    labelTextColor: foreground,
    loopTextColor: foreground,
    noteBkgColor: muted,
    noteTextColor: foreground,
    noteBorderColor: border,
    activationBkgColor: muted,
    activationBorderColor: border,
    sequenceNumberColor: card,
  };
}

/**
 * Renders a mermaid diagram from a fenced ```mermaid block. Mermaid is heavy and
 * browser-only, so it is dynamically imported on mount (kept out of the main
 * bundle for diagram-free pages) and rendered asynchronously into an SVG. The
 * diagram re-renders when the app theme changes. If the source fails to parse,
 * it falls back to showing the raw block via {@link CodeBlock} so a broken
 * diagram never blanks the page.
 */
export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const rawId = useId();
  const renderId = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const isDark = useIsDark();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          theme: 'base',
          themeVariables: themeVariables(),
        });
        const { svg: rendered } = await mermaid.render(renderId, code);
        if (!cancelled) {
          setSvg(rendered);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, isDark, renderId]);

  if (failed) {
    return <CodeBlock code={code} language="mermaid" showHeader />;
  }

  if (svg == null) {
    return (
      <div className="my-6 flex h-40 animate-pulse items-center justify-center rounded-lg border border-border bg-muted/40 text-sm text-muted-foreground">
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="not-prose my-6 flex justify-center overflow-x-auto rounded-lg border border-border bg-card p-6 [&_svg]:max-w-full"
      // eslint-disable-next-line react/no-danger -- mermaid output, securityLevel: strict
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

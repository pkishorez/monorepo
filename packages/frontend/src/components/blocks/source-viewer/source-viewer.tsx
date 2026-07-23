import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import githubDark from '@shikijs/themes/github-dark';
import githubLight from '@shikijs/themes/github-light';
import {
  createHighlighterCore,
  type HighlighterCore,
  type LanguageInput,
} from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

import { cn } from '#lib/utils';
import { scrollbarStyles } from '#lib/scrollStyles';

export interface SourceViewerRange {
  readonly startLine: number;
  readonly endLine: number;
}

export interface SourceViewerSection {
  readonly id: string;
  readonly range: SourceViewerRange;
}

export interface SourceViewerProps {
  readonly filePath: string;
  readonly content: string;
  readonly range?: SourceViewerRange | null;
  readonly sections?: readonly SourceViewerSection[];
  readonly onSectionClick?: (sectionId: string) => void;
  readonly scrollRequestId?: number;
  readonly actions?: ReactNode;
  readonly className?: string;
}

type SourceLanguage =
  | 'css'
  | 'html'
  | 'javascript'
  | 'json'
  | 'jsx'
  | 'markdown'
  | 'text'
  | 'tsx'
  | 'typescript'
  | 'yaml';

const languageByExtension: Readonly<Record<string, SourceLanguage>> = {
  cjs: 'javascript',
  css: 'css',
  html: 'html',
  js: 'javascript',
  json: 'json',
  jsx: 'jsx',
  md: 'markdown',
  mjs: 'javascript',
  mts: 'typescript',
  ts: 'typescript',
  tsx: 'tsx',
  yaml: 'yaml',
  yml: 'yaml',
};

const highlighter = createHighlighterCore({
  themes: [githubLight, githubDark],
  langs: [],
  engine: createOnigurumaEngine(import('shiki/wasm')),
});

const languageLoaders: Record<
  Exclude<SourceLanguage, 'text'>,
  () => LanguageInput
> = {
  css: () => import('@shikijs/langs/css'),
  html: () => import('@shikijs/langs/html'),
  javascript: () => import('@shikijs/langs/javascript'),
  json: () => import('@shikijs/langs/json'),
  jsx: () => import('@shikijs/langs/jsx'),
  markdown: () => import('@shikijs/langs/markdown'),
  tsx: () => import('@shikijs/langs/tsx'),
  typescript: () => import('@shikijs/langs/typescript'),
  yaml: () => import('@shikijs/langs/yaml'),
};

const loadingLanguages = new Map<SourceLanguage, Promise<void>>();

function loadLanguage(instance: HighlighterCore, language: SourceLanguage) {
  if (language === 'text' || instance.getLoadedLanguages().includes(language)) {
    return Promise.resolve();
  }
  const loading =
    loadingLanguages.get(language) ??
    instance.loadLanguage(languageLoaders[language]());
  loadingLanguages.set(language, loading);
  return loading;
}

function paintSourceLine(line: HTMLElement, hovered = false) {
  const depth = Number(line.dataset.sourceDepth ?? 0);
  const focused = line.dataset.sourceFocused === 'true';
  if (depth === 0 && !focused) {
    line.style.backgroundColor = '';
    line.style.borderInlineStartColor = '';
    line.style.boxShadow = '';
    return;
  }
  const fillAlpha = Math.min(
    focused ? 0.22 : 0.12,
    (focused ? 0.16 : 0.02) +
      Math.max(0, depth - 1) * 0.025 +
      (hovered ? 0.045 : 0),
  );
  const borderAlpha = Math.min(
    1,
    (focused ? 0.95 : 0.2) + Math.max(0, depth - 1) * 0.1 + (hovered ? 0.2 : 0),
  );
  const color = focused ? '251 191 36' : '56 189 248';
  line.style.backgroundColor = `rgb(${color} / ${fillAlpha})`;
  line.style.borderInlineStartColor = `rgb(${color} / ${borderAlpha})`;
  line.style.boxShadow = focused
    ? [
        'inset 3px 0 rgb(251 191 36 / 0.95)',
        'inset -1px 0 rgb(251 191 36 / 0.55)',
        'inset 0 0 14px rgb(251 191 36 / 0.09)',
        line.dataset.sourceFocusFirst === 'true'
          ? 'inset 0 1px rgb(251 191 36 / 0.75)'
          : '',
        line.dataset.sourceFocusLast === 'true'
          ? 'inset 0 -1px rgb(251 191 36 / 0.75)'
          : '',
      ]
        .filter(Boolean)
        .join(', ')
    : '';
}

export function SourceViewer({
  filePath,
  content,
  range,
  sections = [],
  onSectionClick,
  scrollRequestId,
  actions,
  className,
}: SourceViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const handledScrollRequestRef = useRef<number | undefined>(undefined);
  const hoveredSectionRef = useRef<string | null>(null);
  const focusedLinesRef = useRef<readonly HTMLElement[]>([]);
  const [rendered, setRendered] = useState<{
    readonly content: string;
    readonly language: SourceLanguage;
    readonly html: string;
  } | null>(null);
  const language = useMemo(() => {
    const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
    return languageByExtension[extension] ?? 'text';
  }, [filePath]);
  const html =
    rendered?.content === content && rendered.language === language
      ? rendered.html
      : '';

  useEffect(() => {
    let active = true;
    void highlighter
      .then(async (instance) => {
        await loadLanguage(instance, language);
        return instance.codeToHtml(content, {
          lang: language,
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
          transformers: [
            {
              span(node) {
                this.addClassToHast(node, 'shiki-token');
              },
              line(node, line) {
                node.properties['data-line'] = line;
                this.addClassToHast(node, 'source-line');
              },
            },
          ],
        });
      })
      .then((next) => {
        if (active) setRendered({ content, language, html: next });
      });
    return () => {
      active = false;
    };
  }, [content, language]);

  useLayoutEffect(() => {
    if (!html) return;
    hoveredSectionRef.current = null;
    const viewport = viewportRef.current;
    const lines = viewport?.querySelectorAll<HTMLElement>('[data-line]');
    lines?.forEach((line) => {
      const lineNumber = Number(line.dataset.line);
      const matchingRanges = new Set(
        sections.flatMap(({ range: sectionRange }) =>
          lineNumber >= sectionRange.startLine &&
          lineNumber <= sectionRange.endLine
            ? [`${sectionRange.startLine}:${sectionRange.endLine}`]
            : [],
        ),
      );
      const depth = matchingRanges.size;
      const section = depth > 0;
      line.dataset.sourceDepth = String(depth);
      line.classList.toggle('source-line-section', section);
      line.classList.remove('source-line-section-hovered');
      paintSourceLine(line);
    });
  }, [filePath, html, sections]);

  useLayoutEffect(() => {
    if (!html) return;
    for (const line of focusedLinesRef.current) {
      line.dataset.sourceFocused = 'false';
      line.dataset.sourceFocusFirst = 'false';
      line.dataset.sourceFocusLast = 'false';
      line.classList.remove('source-line-focused');
      paintSourceLine(line);
    }
    const viewport = viewportRef.current;
    const focusedLines: HTMLElement[] = [];
    if (range) {
      for (
        let lineNumber = range.startLine;
        lineNumber <= range.endLine;
        lineNumber++
      ) {
        const line = viewport?.querySelector<HTMLElement>(
          `[data-line="${lineNumber}"]`,
        );
        if (!line) continue;
        line.dataset.sourceFocused = 'true';
        line.classList.add('source-line-focused');
        focusedLines.push(line);
      }
    }
    const firstFocusedLine = focusedLines[0];
    const lastFocusedLine = focusedLines.at(-1);
    if (firstFocusedLine) firstFocusedLine.dataset.sourceFocusFirst = 'true';
    if (lastFocusedLine) lastFocusedLine.dataset.sourceFocusLast = 'true';
    for (const line of focusedLines) paintSourceLine(line);
    focusedLinesRef.current = focusedLines;

    if (
      !range ||
      scrollRequestId === undefined ||
      handledScrollRequestRef.current === scrollRequestId
    ) {
      return;
    }
    if (!viewport || !firstFocusedLine || !lastFocusedLine) return;
    const viewportBounds = viewport.getBoundingClientRect();
    const firstBounds = firstFocusedLine.getBoundingClientRect();
    const lastBounds = lastFocusedLine.getBoundingClientRect();
    const selectionTop =
      viewport.scrollTop + firstBounds.top - viewportBounds.top;
    const selectionBottom =
      viewport.scrollTop + lastBounds.bottom - viewportBounds.top;
    const selectionHeight = selectionBottom - selectionTop;
    const padding = 16;
    const desiredTop =
      selectionHeight <= viewport.clientHeight - padding * 2
        ? selectionTop - (viewport.clientHeight - selectionHeight) / 2
        : selectionTop - padding;
    const target = Math.max(
      0,
      Math.min(viewport.scrollHeight - viewport.clientHeight, desiredTop),
    );
    viewport.scrollTop = target;
    handledScrollRequestRef.current = scrollRequestId;
  }, [filePath, html, range, scrollRequestId]);

  const sectionAtTarget = (target: EventTarget) => {
    if (!(target instanceof Element)) return undefined;
    const line = target.closest<HTMLElement>('[data-line]');
    if (!line) return undefined;
    const lineNumber = Number(line.dataset.line);
    return sections
      .filter(
        ({ range: sectionRange }) =>
          lineNumber >= sectionRange.startLine &&
          lineNumber <= sectionRange.endLine,
      )
      .sort(
        (left, right) =>
          left.range.endLine -
          left.range.startLine -
          (right.range.endLine - right.range.startLine),
      )[0];
  };

  const setHoveredSection = (sectionId: string | null) => {
    if (hoveredSectionRef.current === sectionId) return;
    hoveredSectionRef.current = sectionId;
    const section = sections.find((candidate) => candidate.id === sectionId);
    viewportRef.current
      ?.querySelectorAll<HTMLElement>('[data-line]')
      .forEach((line) => {
        const lineNumber = Number(line.dataset.line);
        line.classList.toggle(
          'source-line-section-hovered',
          Boolean(
            section &&
            lineNumber >= section.range.startLine &&
            lineNumber <= section.range.endLine,
          ),
        );
        paintSourceLine(
          line,
          Boolean(
            section &&
            lineNumber >= section.range.startLine &&
            lineNumber <= section.range.endLine,
          ),
        );
      });
  };

  const handleSectionClick = (target: EventTarget) => {
    if (!onSectionClick) return;
    const section = sectionAtTarget(target);
    if (section) onSectionClick(section.id);
  };

  return (
    <section
      className={cn('flex h-full min-h-0 flex-col bg-background', className)}
      aria-label={`Source: ${filePath}`}
    >
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-3">
        <span
          className="min-w-0 flex-1 truncate font-mono text-xs"
          title={filePath}
        >
          {filePath}
        </span>
        {actions}
      </header>
      <div
        ref={viewportRef}
        className={cn(
          'source-viewer min-h-0 flex-1 overflow-x-auto overflow-y-scroll overscroll-contain bg-background font-mono text-[13px] [scrollbar-gutter:stable] [&_.shiki]:min-h-full [&_.shiki]:min-w-max [&_.shiki]:bg-transparent! [&_.shiki]:py-3 [&_code]:flex [&_code]:flex-col [&_code]:[counter-reset:line] [&_.source-line]:relative [&_.source-line]:box-border [&_.source-line]:block [&_.source-line]:min-h-[1.375rem] [&_.source-line]:border-s-2 [&_.source-line]:border-transparent [&_.source-line]:pe-6 [&_.source-line]:ps-14 [&_.source-line]:leading-[1.375rem] [&_.source-line]:transition-colors [&_.source-line]:duration-100 [&_.source-line]:[counter-increment:line] [&_.source-line]:before:absolute [&_.source-line]:before:start-0 [&_.source-line]:before:w-11 [&_.source-line]:before:pe-3 [&_.source-line]:before:text-end [&_.source-line]:before:text-[11px] [&_.source-line]:before:text-muted-foreground/35 [&_.source-line]:before:content-[counter(line)] [&_.source-line-section]:cursor-pointer [&_.source-line-focused]:cursor-pointer',
          scrollbarStyles,
        )}
        onClick={(event) => handleSectionClick(event.target)}
        onPointerMove={(event) =>
          setHoveredSection(sectionAtTarget(event.target)?.id ?? null)
        }
        onPointerLeave={() => setHoveredSection(null)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}

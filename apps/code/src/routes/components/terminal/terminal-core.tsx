import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import { Effect, Fiber, Stream, Cause, Schedule } from 'effect';
import { Terminal } from '@xterm/xterm';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import './terminal.css';
import './fonts/firacode-nerd-font.css';
import { CodeClient, codeRuntime } from '@/routes/internal/effect';
import { useTouchScroll } from './use-touch-scroll';

const FONTS = {
  firacode: {
    family: "'FiraCode Nerd Font Mono', monospace",
    weight: 500,
    weightBold: 700,
  },
  geist: {
    family: "'GeistMono Nerd Font Mono', monospace",
    weight: 500,
    weightBold: 700,
  },
} satisfies Record<
  string,
  { family: string; weight: number; weightBold: number }
>;

export type FontName = keyof typeof FONTS;

export interface TerminalConfig {
  cols?: number;
  rows?: number;
  font?: FontName;
  fontSize?: number;
  lineHeight?: number;
  scrollback?: number;
}

const DEFAULTS = {
  cols: 50,
  rows: 25,
  font: 'geist' as FontName,
  fontSize: 18,
  lineHeight: 1.3,
  scrollback: 1000,
};

export interface TerminalCoreHandle {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
}

interface TerminalCoreProps {
  sessionId: number;
  readOnly?: boolean;
  config?: TerminalConfig;
  isMobile: boolean;
}

export const TerminalCore = forwardRef<TerminalCoreHandle, TerminalCoreProps>(
  function TerminalCore(
    { sessionId, readOnly = false, config, isMobile },
    ref,
  ) {
    const contentRef = useRef<HTMLDivElement>(null);
    const terminalElRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const applyScaleRef = useRef<(() => void) | null>(null);
    const scrollAccum = useRef(0);
    const scrollBuffer = useRef('');
    const scrollFlushId = useRef<number | null>(null);
    const writeToServer = useRef((data: string) => {
      codeRuntime.runFork(
        Effect.gen(function* () {
          const { client } = yield* CodeClient;
          yield* client.writeToTerminal({ id: sessionId, data });
        }),
      );
    });

    const flushScrollBuffer = useCallback(() => {
      scrollFlushId.current = null;
      if (scrollBuffer.current) {
        writeToServer.current(scrollBuffer.current);
        scrollBuffer.current = '';
      }
    }, []);

    const queueScrollWrite = useCallback(
      (data: string) => {
        scrollBuffer.current += data;
        if (scrollFlushId.current === null) {
          scrollFlushId.current = requestAnimationFrame(flushScrollBuffer);
        }
      },
      [flushScrollBuffer],
    );

    const cfg = { ...DEFAULTS, ...config };
    const lineHeightPx = cfg.fontSize * cfg.lineHeight;

    const onScrollDelta = useCallback(
      (dy: number) => {
        const term = termRef.current;
        if (!term) return;
        scrollAccum.current += dy;
        const lines = Math.trunc(scrollAccum.current / lineHeightPx);
        if (lines !== 0) {
          scrollAccum.current -= lines * lineHeightPx;
          const count = Math.abs(lines);
          const mode = term.modes.mouseTrackingMode;
          if (mode === 'vt200' || mode === 'drag' || mode === 'any') {
            const button = lines > 0 ? 65 : 64;
            const seq = `\x1b[<${button};1;1M`;
            queueScrollWrite(seq.repeat(count));
          } else if (term.buffer.active.type === 'alternate') {
            const seq = lines > 0 ? '\x1b[B' : '\x1b[A';
            queueScrollWrite(seq.repeat(count));
          } else {
            term.scrollLines(lines);
          }
        }
      },
      [lineHeightPx, queueScrollWrite],
    );

    useTouchScroll(overlayRef, onScrollDelta, isMobile);

    useImperativeHandle(ref, () => ({
      write(data: string) {
        if (readOnly) return;
        writeToServer.current(data);
      },
      resize(cols: number, rows: number) {
        termRef.current?.resize(cols, rows);
        codeRuntime.runFork(
          Effect.gen(function* () {
            const { client } = yield* CodeClient;
            yield* client.resizeTerminal({ id: sessionId, cols, rows });
          }),
        );
      },
    }));

    useEffect(() => {
      const term = termRef.current;
      if (!term) return;
      if (term.cols !== cfg.cols || term.rows !== cfg.rows) {
        term.resize(cfg.cols, cfg.rows);
        applyScaleRef.current?.();
        codeRuntime.runFork(
          Effect.gen(function* () {
            const { client } = yield* CodeClient;
            yield* client.resizeTerminal({
              id: sessionId,
              cols: cfg.cols,
              rows: cfg.rows,
            });
          }),
        );
      }
    }, [cfg.cols, cfg.rows, sessionId]);

    useEffect(() => {
      const el = terminalElRef.current;
      const content = contentRef.current;
      if (!el || !content) return;

      const font = FONTS[cfg.font];
      const term = new Terminal({
        allowProposedApi: true,
        cursorBlink: true,
        disableStdin: isMobile || readOnly,
        fontFamily: font.family,
        fontSize: cfg.fontSize,
        fontWeight: font.weight,
        fontWeightBold: font.weightBold,
        lineHeight: cfg.lineHeight,
        cols: cfg.cols,
        rows: cfg.rows,
        scrollback: cfg.scrollback,
        customGlyphs: true,
        rescaleOverlappingGlyphs: true,
        overviewRuler: { width: 0 },
        theme: {
          background: '#09090b',
          foreground: '#fafafa',
          cursor: '#fafafa',
          scrollbarSliderBackground: 'transparent',
          scrollbarSliderHoverBackground: 'transparent',
          scrollbarSliderActiveBackground: 'transparent',
        },
      });
      termRef.current = term;

      const unicode11 = new Unicode11Addon();
      term.loadAddon(unicode11);
      term.unicode.activeVersion = '11';

      term.open(el);

      const xtermEl = el.querySelector('.xterm') as HTMLElement;

      const applyScale = () => {
        const naturalWidth = xtermEl.scrollWidth;
        const availableWidth = content.clientWidth;
        if (naturalWidth <= 0 || availableWidth <= 0) return;

        const scale = availableWidth / naturalWidth;
        xtermEl.style.transform = `scale(${scale})`;
        xtermEl.style.transformOrigin = 'top left';
        content.style.height = `${xtermEl.scrollHeight * scale}px`;
      };

      applyScale();
      applyScaleRef.current = applyScale;

      const resizeObserver = new ResizeObserver(() => applyScale());
      resizeObserver.observe(content);

      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);

      if (!readOnly && !isMobile) {
        term.attachCustomKeyEventHandler((e) => {
          if (e.key === 'Enter' && e.shiftKey && e.type === 'keydown') {
            writeToServer.current('\n');
            return false;
          }
          return true;
        });
        term.onData((data) => writeToServer.current(data));
      }

      const syncAndStream = Effect.gen(function* () {
        const { client } = yield* CodeClient;

        const snapshot = yield* client.getTerminalSnapshot({ id: sessionId });
        term.reset();
        if (snapshot.data) {
          term.write(snapshot.data);
        }

        yield* client
          .streamTerminal({ id: sessionId })
          .pipe(
            Stream.runForEach((data) => Effect.sync(() => term.write(data))),
          );
      });

      const program = syncAndStream.pipe(
        Effect.retry(Schedule.spaced('2 seconds')),
      );

      const fiber = codeRuntime.runFork(program);

      fiber.addObserver((exit) => {
        if (exit._tag === 'Failure' && !Cause.hasInterruptsOnly(exit.cause)) {
          console.error('Terminal error:', exit.cause);
        }
      });

      return () => {
        if (scrollFlushId.current !== null) {
          cancelAnimationFrame(scrollFlushId.current);
          scrollFlushId.current = null;
        }
        resizeObserver.disconnect();
        Effect.runFork(Fiber.interrupt(fiber));
        applyScaleRef.current = null;
        termRef.current = null;
        term.dispose();
      };
    }, [sessionId]);

    return (
      <div
        className={`terminal-container ${isMobile ? 'terminal-container--mobile' : ''}`}
      >
        <div ref={contentRef} className="terminal-content">
          <div
            ref={terminalElRef}
            className={isMobile ? 'pointer-events-none' : undefined}
          />
        </div>
        {isMobile && (
          <div ref={overlayRef} className="absolute inset-0 z-[1] touch-none" />
        )}
      </div>
    );
  },
);

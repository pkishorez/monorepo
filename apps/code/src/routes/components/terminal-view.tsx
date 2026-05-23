import { useEffect, useRef, useCallback } from 'react';
import { Effect, Fiber, Stream, Option, Cause } from 'effect';
import { Terminal } from '@xterm/xterm';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import {
  motion,
  useMotionValue,
  animate,
  type PanInfo,
} from '@monorepo/frontend/motion';
import '@xterm/xterm/css/xterm.css';
import './terminal-view.css';
import './fonts/firacode-nerd-font.css';
import { CodeClient, codeRuntime } from '@/routes/internal/effect';

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

type FontName = keyof typeof FONTS;

const DEFAULTS = {
  cols: 50,
  rows: 25,
  font: 'geist' as FontName,
  fontSize: 18,
  lineHeight: 1.3,
  scrollback: 1000,
};

export function TerminalView({ cwd }: { cwd: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const terminalElRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const viewportRef = useRef<HTMLElement | null>(null);
  const inertiaY = useMotionValue(0);
  const lastInertiaY = useRef(0);

  const onPanStart = useCallback(() => {
    inertiaY.stop();
  }, [inertiaY]);

  const onPan = useCallback((_: unknown, info: PanInfo) => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop -= info.delta.y;
    }
  }, []);

  const onPanEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      lastInertiaY.current = 0;
      inertiaY.jump(0);
      animate(inertiaY, -info.velocity.y * 0.3, {
        type: 'inertia',
        velocity: -info.velocity.y,
        power: 0.2,
        timeConstant: 200,
        bounceStiffness: 0,
        bounceDamping: 0,
      });
    },
    [inertiaY],
  );

  useEffect(() => {
    const el = terminalElRef.current;
    const wrapper = wrapperRef.current;
    if (!el || !wrapper) return;

    const font = FONTS[DEFAULTS.font];
    const term = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      fontFamily: font.family,
      fontSize: DEFAULTS.fontSize,
      fontWeight: font.weight,
      fontWeightBold: font.weightBold,
      lineHeight: DEFAULTS.lineHeight,
      cols: DEFAULTS.cols,
      rows: DEFAULTS.rows,
      scrollback: DEFAULTS.scrollback,
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
    terminalRef.current = term;

    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = '11';

    term.open(el);

    const xtermEl = el.querySelector('.xterm') as HTMLElement;
    const termWidth = xtermEl.offsetWidth;
    const containerWidth = wrapper.clientWidth;
    if (termWidth > containerWidth) {
      wrapper.style.setProperty(
        '--terminal-zoom',
        String(containerWidth / termWidth),
      );
    }

    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);

    const viewport = el.querySelector('.xterm-viewport') as HTMLElement;
    viewportRef.current = viewport;

    const unsubInertia = inertiaY.on('change', (v) => {
      const delta = v - lastInertiaY.current;
      lastInertiaY.current = v;
      viewport.scrollTop += delta;
    });

    let terminalId: number | null = null;

    const program = Effect.gen(function* () {
      const { client } = yield* CodeClient;

      const { id } = yield* client.createTerminal({
        command: Option.none(),
        cwd: cwd,
        env: Option.none(),
        cols: DEFAULTS.cols,
        rows: DEFAULTS.rows,
        scrollback: DEFAULTS.scrollback,
      });
      terminalId = id;

      term.onData((data) => {
        codeRuntime.runFork(
          Effect.gen(function* () {
            const { client } = yield* CodeClient;
            yield* client.writeToTerminal({ id, data });
          }),
        );
      });

      yield* client
        .streamTerminal({ id })
        .pipe(Stream.runForEach((data) => Effect.sync(() => term.write(data))));
    });

    const fiber = codeRuntime.runFork(program);

    fiber.addObserver((exit) => {
      if (exit._tag === 'Failure' && !Cause.isInterruptedOnly(exit.cause)) {
        console.error('Terminal error:', exit.cause);
      }
    });

    return () => {
      Effect.runFork(Fiber.interrupt(fiber));

      if (terminalId !== null) {
        codeRuntime.runFork(
          Effect.gen(function* () {
            const { client } = yield* CodeClient;
            yield* client.killTerminal({ id: terminalId! });
          }),
        );
      }

      unsubInertia();
      term.dispose();
    };
  }, [cwd]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#09090b] overflow-hidden">
      <motion.div
        ref={wrapperRef}
        className="terminal-container touch-none"
        onPanStart={onPanStart}
        onPan={onPan}
        onPanEnd={onPanEnd}
      >
        <div ref={terminalElRef} />
      </motion.div>
    </div>
  );
}

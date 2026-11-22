import { useState } from 'react';
import type { ReactNode } from 'react';
import { Router } from '@kestack/kabuki/routing';
import { View } from '@kestack/kabuki/react';
import { Toaster } from '@kestack/web-platform/ui/components/toast';
import { Button } from '@kestack/web-platform/ui/components/button';
import { ArrowRightIcon, MoonIcon, SunIcon } from 'lucide-react';
import { DevToolsLive } from './actor.js';
import { KabukiPageView } from './pages/kabuki.js';
import { LotelPageView } from './pages/lotel.js';
import { MonoversePageView } from './pages/monoverse.js';

/*
 * The frame around every Tool: on a wide screen a header with the Tools as
 * tabs and the theme toggle; on a narrow one no header at all, the Tools
 * and the theme toggle along the bottom, so the Tool has the whole height. Between them the page the URL names: the
 * list of Tools at `/`, a Tool, or that nothing is there. The theme is the
 * browser's to keep, `devtools:theme`, dark unless it says light.
 */

type Theme = 'dark' | 'light';
type Tool = 'Lotel' | 'Monoverse' | 'Kabuki';

const TOOLS: ReadonlyArray<{
  readonly tool: Tool;
  readonly description: string;
}> = [
  {
    tool: 'Lotel',
    description: 'Traces and Logs from local OpenTelemetry data.',
  },
  {
    tool: 'Monoverse',
    description:
      'Packages, their dependencies, and changes across a monorepo or a single package, with Laymos for each.',
  },
  {
    tool: 'Kabuki',
    description:
      "Running Kabuki apps, live: each one's Actor tree and History, and Time Travel on the app itself.",
  },
];

const THEME_KEY = 'devtools:theme';

/** The theme the browser kept, dark unless it says light. */
export const readTheme = (): Theme =>
  globalThis.localStorage?.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';

/** Puts the theme on the page, and keeps it for next time. */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  globalThis.localStorage?.setItem(THEME_KEY, theme);
}

export const DevToolsView = View.make(DevToolsLive, ({ props, children }) => {
  const at = props.route.page?._tag;
  const tool: Tool | null =
    at === 'Lotel' || at === 'Monoverse' || at === 'Kabuki' ? at : null;
  return (
    <Shell tool={tool}>
      {children.Lotel ? (
        <LotelPageView instance={children.Lotel} />
      ) : children.Monoverse ? (
        <MonoversePageView instance={children.Monoverse} />
      ) : children.Kabuki ? (
        <KabukiPageView instance={children.Kabuki} />
      ) : children.Home ? (
        <Home />
      ) : props.route.notFound !== null ? (
        <NotFound />
      ) : null}
    </Shell>
  );
});

function Shell({ tool, children }: { tool: Tool | null; children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="hidden h-11 shrink-0 grid-cols-[1fr_auto] items-center border-b border-border/50 px-4 md:grid">
        <div className="flex items-center">
          <Router.Link
            to={{ _tag: 'Home' }}
            className="text-sm font-medium tracking-tight text-foreground/90 transition-colors hover:text-foreground"
          >
            DevTools
          </Router.Link>
          <nav className="ml-6 flex items-center gap-1">
            {TOOLS.map(({ tool: one }) => (
              <ToolLink key={one} tool={one} active={one === tool} />
            ))}
          </nav>
        </div>
        <ThemeButton theme={theme} onToggle={toggle} />
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      <nav
        aria-label="Tools"
        className="grid shrink-0 grid-cols-[1fr_1fr_1fr_auto] items-center gap-1 border-t border-border/60 bg-background px-2 pb-[max(env(safe-area-inset-bottom),0.25rem)] md:hidden"
      >
        {TOOLS.map(({ tool: one }) => (
          <MobileToolLink key={one} tool={one} active={one === tool} />
        ))}
        <ThemeButton
          theme={theme}
          className="size-11 shrink-0"
          onToggle={toggle}
        />
      </nav>
      <Toaster />
    </div>
  );
}

function ThemeButton({
  theme,
  onToggle,
  className,
}: {
  theme: Theme;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Button
      className={`justify-self-end text-muted-foreground/70 hover:text-foreground ${className ?? ''}`}
      size="icon-sm"
      variant="ghost"
      aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}
      onClick={onToggle}
    >
      {theme === 'dark' ? (
        <SunIcon className="size-3.5" />
      ) : (
        <MoonIcon className="size-3.5" />
      )}
    </Button>
  );
}

/** Whether a link is to the Tool shown: drawn as the tab that is open. */
const current = (active: boolean) =>
  active ? ({ 'aria-current': 'page', 'data-status': 'active' } as const) : {};

function ToolLink({ tool, active }: { tool: Tool; active: boolean }) {
  return (
    <Router.Link
      to={{ _tag: tool }}
      {...current(active)}
      className="relative flex h-11 items-center px-2 text-sm text-muted-foreground transition-colors hover:text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 after:transition-opacity data-[status=active]:font-medium data-[status=active]:text-foreground data-[status=active]:after:opacity-100"
    >
      {tool}
    </Router.Link>
  );
}

function MobileToolLink({ tool, active }: { tool: Tool; active: boolean }) {
  return (
    <Router.Link
      to={{ _tag: tool }}
      {...current(active)}
      className="my-1 flex min-h-11 items-center justify-center rounded-lg text-sm font-medium text-muted-foreground transition-colors active:bg-muted data-[status=active]:bg-muted data-[status=active]:text-foreground"
    >
      {tool}
    </Router.Link>
  );
}

function Home() {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-10 sm:px-6 sm:py-16">
        <h1 className="text-xl font-medium tracking-tight">DevTools</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Runtime telemetry and architecture for local Projects.
        </p>
        <nav className="mt-10 divide-y divide-border/60 border-y border-border/60">
          {TOOLS.map(({ tool, description }) => (
            <Router.Link
              key={tool}
              to={{ _tag: tool }}
              className="group -mx-3 flex items-center justify-between gap-6 rounded-md px-3 py-5 transition-colors hover:bg-muted/40"
            >
              <span>
                <span className="block text-sm font-medium">{tool}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {description}
                </span>
              </span>
              <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground/60 transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Router.Link>
          ))}
        </nav>
        <p className="mt-10 font-mono text-[11px] text-muted-foreground/60">
          v{__DEVTOOLS_VERSION__}
        </p>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="grid h-full place-items-center px-6">
      <div className="text-center">
        <p className="text-sm font-medium">Page not found</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          There is nothing at this address.
        </p>
        <Router.Link
          to={{ _tag: 'Home' }}
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to DevTools <ArrowRightIcon className="size-3.5" />
        </Router.Link>
      </div>
    </div>
  );
}

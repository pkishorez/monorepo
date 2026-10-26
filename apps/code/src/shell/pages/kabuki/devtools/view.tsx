import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { cn } from '@kestack/web-platform/ui/components/utils';
import * as routes from '../../../routes/index.ts';
import { LiveView } from '../live/view.tsx';
import { StoryView } from '../story/view.tsx';
import { DevtoolsLive } from './actor.ts';

/*
 * The tool's root View: its header, with the mode, and the mode's own
 * View under it. Only the mode shown is drawn; the other keeps running.
 */

const MODES = [
  ['live', 'Live'],
  ['story', 'Story'],
] as const;

export const DevtoolsView = View.make(
  DevtoolsLive,
  ({ root, model, children, send }) => (
    <div
      {...root}
      className="flex h-dvh flex-col overflow-hidden bg-background text-foreground"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-3 pt-[env(safe-area-inset-top)] md:px-4">
        <h1 className="flex min-h-14 items-center gap-2 text-sm font-semibold">
          Kabuki
          <span className="font-normal text-muted-foreground">code</span>
        </h1>
        <div
          role="radiogroup"
          aria-label="Mode"
          className="ml-auto flex rounded-lg border border-border p-0.5"
        >
          {MODES.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={model.mode === mode}
              onClick={() => send({ _tag: 'Switched', mode })}
              className={cn(
                'h-10 rounded-md px-4 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none md:h-8',
                model.mode === mode
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Router.Link
          to={routes.home()}
          className="hidden text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground sm:inline"
        >
          Back to code
        </Router.Link>
      </header>
      {model.mode === 'live' ? (
        <LiveView instance={children.live} />
      ) : (
        <StoryView instance={children.story} />
      )}
    </div>
  ),
);

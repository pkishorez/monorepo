import { View } from '@kestack/kabuki/react';
import type { ReactNode, Ref } from 'react';
import { Draft } from '../draft/index.ts';
import { StarterLive } from './actor.ts';

/*
 * What a new session looks like, on the project's page and in the Project
 * Picker's Drawer alike: what it is and where, over the Draft at its foot,
 * which starts it.
 */

/** A new session: the words over its Draft, with whatever else the place adds under them. */
export function NewSessionBody({
  path,
  page,
  extra,
  draft,
}: {
  /** The project's folder, once known. */
  readonly path: string | null;
  /** The scrolling part, for a page that focuses it. */
  readonly page?: Ref<HTMLDivElement>;
  /** Under the words, such as removing the project. */
  readonly extra?: ReactNode;
  readonly draft: ReactNode;
}) {
  return (
    <>
      <div
        ref={page}
        tabIndex={page === undefined ? undefined : -1}
        className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto outline-none"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-1 px-4 pt-8 pb-6 sm:px-6">
          <h2 className="text-lg font-semibold">New session</h2>
          <p className="text-sm text-muted-foreground">
            Write the first message to start one
            {path !== null ? (
              <>
                {' '}
                in <span className="font-mono text-xs">{path}</span>
              </>
            ) : null}
            .
          </p>
          {extra}
        </div>
      </div>
      <section
        aria-label="New session"
        className="relative shrink-0 bg-background pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-gradient-to-t before:from-background before:to-transparent"
      >
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">{draft}</div>
      </section>
    </>
  );
}

/** A new session outside the project's page. */
export const StarterView = View.make(
  StarterLive,
  ({ root, props, children }) => (
    <div {...root} className="flex min-h-0 flex-1 flex-col">
      <NewSessionBody
        path={props.path}
        draft={children.draft && <Draft.view instance={children.draft} />}
      />
    </div>
  ),
);

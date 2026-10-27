import type { ComponentProps, ReactNode } from 'react';
import {
  GUTTERED,
  useGutter,
} from '../../../../../../../ui/page/gutter/index.ts';
import { keys } from '../../../commands.ts';
import { Draft } from '../draft/index.ts';

/*
 * A new session on the project's page, while no session is open: what it
 * is and where, over the Draft at its foot, which starts it. The page is
 * the content's default Focus Spot. The project page adds what it knows
 * to it, such as Remove, or why no session can start, which blocks the
 * Draft.
 */

/** A new session: the words over its Draft, with whatever else the project adds under them. */
export function NewSession({
  path,
  about,
  extra,
  blocked,
  draft,
}: {
  /** The project's folder, once known. */
  readonly path: string | null;
  /** In place of how to start one, such as why none can be; nothing given (or `false`), how to start one shows. */
  readonly about?: ReactNode;
  /** Under the words, such as removing the project. */
  readonly extra?: ReactNode;
  /** Nothing can be sent, as `about` says. */
  readonly blocked: boolean;
  /** The project's new session Draft, while there is one. */
  readonly draft: ComponentProps<typeof Draft.view>['instance'] | undefined;
}) {
  const page = keys.useFocusSpot('content', 'page', { default: true });
  // The Draft sits under the words, inset by the room their scrollbar keeps.
  const gutter = useGutter();
  return (
    <>
      <div
        ref={page}
        tabIndex={-1}
        className={`relative flex min-h-0 flex-1 flex-col justify-end overflow-y-auto outline-none ${GUTTERED}`}
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-1 px-4 pt-8 pb-6 sm:px-6">
          <h2 className="text-lg font-semibold">New session</h2>
          {about || (
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
          )}
          {extra}
        </div>
      </div>
      <section
        aria-label="New session"
        style={{ paddingInline: gutter }}
        className="relative shrink-0 bg-background pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-gradient-to-t before:from-background before:to-transparent has-[[data-slot=draft][data-touch]]:pb-0"
      >
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 has-[[data-slot=draft][data-touch]]:px-0">
          {draft && (
            <Draft.Slots value={{ blocked }}>
              <Draft.view instance={draft} />
            </Draft.Slots>
          )}
        </div>
      </section>
    </>
  );
}

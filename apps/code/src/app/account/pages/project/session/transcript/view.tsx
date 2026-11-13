import { View, useChild, useChildren } from '@kestack/kabuki/react';
import type { ChildData } from '@kestack/kabuki/react/types';
import { createContext, use, useMemo, type ReactNode } from 'react';
import type {
  Messages,
  SessionRow,
} from '../../../../connection/records/index.ts';
import { RunningPicker, TranscriptLive } from './actor.ts';

/*
 * The transcript's View, around the session's: what it reads, handed to
 * the page drawn inside it, which draws the transcript, the Draft and the
 * Question Panel from it; and the Running Picker, while it is open, for
 * the page to place by its button.
 */

/** What the transcript is drawn around: the session's page, from its View. */
export const Around = createContext<ReactNode>(null);

/** What the transcript reads, as the page draws it. */
export interface Read {
  /** The row's Query, once it is drawn. */
  readonly found: ChildData<typeof SessionRow>['model'] | undefined;
  /** Its own messages' Query, once it is drawn. */
  readonly messages: ChildData<typeof Messages>['model'] | undefined;
  /** The Queries of the sessions it carries on from, as they are drawn. */
  readonly windows: ReadonlyArray<ChildData<typeof Messages>>;
  /** The Running Picker, while it is open. */
  readonly running: ReactNode;
}

const Reading = createContext<Read>({
  found: undefined,
  messages: undefined,
  windows: [],
  running: null,
});

export const TranscriptView = View.make(
  TranscriptLive,
  ({ props, children }) => {
    const found = useChild(children.session, ({ model }) => model);
    const all = useChildren(children.messages);
    const { sessionId } = props;
    const messages = all.find((each) => each.props.sessionId === sessionId);
    const windows = useMemo(
      () => all.filter((each) => each.props.sessionId !== sessionId),
      [all, sessionId],
    );
    const running = children.running;
    const read = useMemo(
      (): Read => ({
        found,
        messages: messages?.model,
        windows,
        running: running && <RunningPicker.View instance={running} />,
      }),
      [found, messages?.model, windows, running],
    );
    return <Reading value={read}>{use(Around)}</Reading>;
  },
);

/** What the transcript reads, for the page drawn inside its View. */
export const useRead = () => use(Reading);

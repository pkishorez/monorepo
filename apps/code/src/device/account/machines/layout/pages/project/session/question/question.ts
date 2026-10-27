import { createContext } from 'react';

/*
 * What the session's page hands the Question Panel: where to draw it
 * expanded, who asks, and Stop, which the Draft would otherwise hold.
 */

/** Stop, while the Turn runs. */
export type Stop = {
  readonly run: () => void;
  readonly stopping: boolean;
  /** Nothing can be stopped, as while the Machine is out of reach. */
  readonly disabled: boolean;
};

export const Around = createContext<{
  /** Over the content column, under the page header: where it is drawn expanded. */
  readonly place: HTMLElement | null;
  /** Who asks, in a word: "Claude". */
  readonly agent: string;
  readonly stop: Stop | null;
  /** Why a stop was refused, until the next. */
  readonly problem: string | null;
}>({ place: null, agent: 'The agent', stop: null, problem: null });

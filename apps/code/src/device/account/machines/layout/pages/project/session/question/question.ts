import { createContext } from 'react';
import type { Agent } from '../../../../../../../../ui/labels/agent/index.ts';

/*
 * What the session's page hands the Question Panel: where to draw it
 * expanded, who asks, and Stop, which the Draft would otherwise hold.
 */

/** Who asks: "Claude", and its logo's agent, or null while not known. */
export type Asker = {
  readonly agent: string;
  readonly harness: Agent | null;
};

/** Stop, while the Turn runs. */
export type Stop = {
  readonly run: () => void;
  readonly stopping: boolean;
  /** Nothing can be stopped, as while the Machine is out of reach. */
  readonly disabled: boolean;
  /** The keys that stop it, as the Draft's Stop names them, or null. */
  readonly keys: string | null;
};

/** What Stop says on hover: what it does, and its keys. */
export const stopTitle = (stop: Stop) =>
  stop.keys === null ? 'Stop the turn' : `Stop the turn (${stop.keys})`;

export const Around = createContext<{
  /** Over the content column, under the page header: where it is drawn expanded. */
  readonly place: HTMLElement | null;
  /** Who asks, in a word: "Claude". */
  readonly agent: string;
  /** Whose logo heads it, or null while not known. */
  readonly harness: Agent | null;
  readonly stop: Stop | null;
  /** Why a stop was refused, until the next. */
  readonly problem: string | null;
}>({
  place: null,
  agent: 'The agent',
  harness: null,
  stop: null,
  problem: null,
});

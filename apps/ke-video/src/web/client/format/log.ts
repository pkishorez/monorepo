import type { Event } from '../../../video/library/schema.ts';
import { timeOfDay } from './time.ts';

/*
 * A Video's Events in the CLI's text form, `HH:MM:SS  <label or step,
 * padded to 12>  <text or NN%>`, as a terminal shows them: consecutive
 * progress-only Events of one step are one line, the latest.
 */

export interface LogLine {
  /** Stays the same while the line is rewritten in place. */
  readonly key: number;
  readonly time: string;
  readonly label: string;
  readonly text: string;
  /** The step whose progress this line counts, if it is only that. */
  readonly counting: string | null;
}

const percent = (progress: number) => `${Math.round(progress * 100)}%`;

export const logLines = (events: ReadonlyArray<Event>): Array<LogLine> => {
  const lines: Array<LogLine> = [];
  events.forEach((event, index) => {
    const counting =
      event.text === undefined && event.progress !== undefined
        ? event.step
        : null;
    const last = lines.at(-1);
    const line = {
      key: index,
      time: timeOfDay(event.at),
      label: event.label ?? event.step,
      text:
        event.text ??
        (event.progress === undefined ? '' : percent(event.progress)),
      counting,
    };
    if (counting !== null && last?.counting === counting)
      lines[lines.length - 1] = { ...line, key: last.key };
    else lines.push(line);
  });
  return lines;
};

/** One line exactly as `ke-video logs` prints it. */
export const textOf = (line: LogLine) =>
  `${line.time}  ${line.label.padEnd(12)}  ${line.text}`;

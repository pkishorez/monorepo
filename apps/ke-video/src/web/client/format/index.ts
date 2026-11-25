/*
 * What the Views show, worked out from the data alone: times, the log in
 * the CLI's text form, and a Video's status in words.
 */
export { logLines, textOf, type LogLine } from './log.ts';
export {
  isWorking,
  lengthsOf,
  currentOf,
  marksOf,
  shorterOf,
  statusOf,
  type Mark,
} from './status.ts';
export { clock, lineAt, span, timeOfDay } from './time.ts';

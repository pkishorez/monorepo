import { Flag } from 'effect/unstable/cli';

export const jsonFlag = Flag.boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Print stable JSON for tools.'),
);

export function renderJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

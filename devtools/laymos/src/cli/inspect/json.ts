import { Flag } from 'effect/cli';

export const jsonFlag = Flag.Boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Print stable JSON for tools.'),
);

export function renderJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

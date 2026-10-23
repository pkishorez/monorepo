/*
 * Which Machine a Dictation is transcribed on: the open Session's Machine
 * when its Speech to Text is Ready and it answers, else the first listed
 * Machine that is Ready and answers. None, and it says why: no Machine has
 * Speech to Text on, or none that has it answers.
 */

/** What a Dictation needs to know of one Machine. */
export interface Hearing {
  /** Its Speech to Text is Ready. */
  readonly ready: boolean;
  /** Its socket is up. */
  readonly answering: boolean;
}

export type Choice =
  | { readonly _tag: 'On'; readonly machineId: string }
  | { readonly _tag: 'None'; readonly reason: string };

export const machineFor = (
  machines: Readonly<Record<string, Hearing>>,
  listed: ReadonlyArray<string>,
  open: string | null,
): Choice => {
  const can = (id: string) =>
    machines[id]?.ready === true && machines[id]?.answering === true;
  const machineId =
    open !== null && listed.includes(open) && can(open)
      ? open
      : listed.find(can);
  if (machineId !== undefined) return { _tag: 'On', machineId };
  return {
    _tag: 'None',
    reason: listed.some((id) => machines[id]?.ready === true)
      ? 'No Machine with Speech to Text is answering'
      : 'Turn on Speech to Text in Settings',
  };
};

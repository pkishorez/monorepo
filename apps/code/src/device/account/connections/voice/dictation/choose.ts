/*
 * Which Connection a Dictation is transcribed on: the open Session's Connection
 * when its Speech to Text is Ready and it answers, else the first listed
 * Connection that is Ready and answers. None, and it says why: no Connection has
 * Speech to Text on, or none that has it answers.
 */

/** What a Dictation needs to know of one Connection. */
export interface Hearing {
  /** Its Speech to Text is Ready. */
  readonly ready: boolean;
  /** Its socket is up. */
  readonly answering: boolean;
}

export type Choice =
  | { readonly _tag: 'On'; readonly connectionId: string }
  | { readonly _tag: 'None'; readonly reason: string };

export const connectionFor = (
  connections: Readonly<Record<string, Hearing>>,
  listed: ReadonlyArray<string>,
  open: string | null,
): Choice => {
  const can = (id: string) =>
    connections[id]?.ready === true && connections[id]?.answering === true;
  const connectionId =
    open !== null && listed.includes(open) && can(open)
      ? open
      : listed.find(can);
  if (connectionId !== undefined) return { _tag: 'On', connectionId };
  return {
    _tag: 'None',
    reason: listed.some((id) => connections[id]?.ready === true)
      ? 'No Connection with Speech to Text is answering'
      : 'Turn on Speech to Text in Settings',
  };
};

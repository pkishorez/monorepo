/*
 * Instance IDs: the parent's ID, the Child's name, its key if it has one, and
 * how many times the parent has Invoked that Child, so the same Messages always
 * give the same IDs and an Instance Invoked again gets a new one.
 *
 *   Auth                  the root, named after its Actor
 *   Auth/api#2            the second `api` Auth Invoked
 *   Auth/api#2/rows[a]#1  the first `rows` keyed `a` under it
 */

export const childId = (
  parent: string,
  slot: string,
  key: string | undefined,
  generation: number,
): string =>
  `${parent}/${slot}${key === undefined ? '' : `[${encodeURIComponent(key)}]`}#${generation}`;

/** What the parent counts its Invocations of a Child under. */
export const counterOf = (slot: string, key: string | undefined): string =>
  key === undefined ? slot : `${slot}[${encodeURIComponent(key)}]`;

/** Whether `id` is `ancestor` or below it. */
export const within = (ancestor: string, id: string): boolean =>
  id === ancestor || id.startsWith(`${ancestor}/`);

/** The slot under `parent` on the way down to `id`, if `id` is below it. */
export const slotToward = (parent: string, id: string): string | undefined => {
  if (!id.startsWith(`${parent}/`)) return undefined;
  const rest = id.slice(parent.length + 1);
  const end = rest.search(/[[#]/);
  return end < 0 ? undefined : rest.slice(0, end);
};

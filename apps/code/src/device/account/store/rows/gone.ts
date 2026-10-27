/*
 * What the user asked to go from this device at once: a Project removed,
 * or a Machine forgotten, told as one thing to every store that keeps
 * something of it (`dropEverywhere`, in the Machine's store), each judging
 * its own rows by whose they are, deleting what of its own went and
 * leaving what it never kept.
 */

/** A Project removed, or a Machine forgotten. */
export type Gone =
  | {
      readonly _tag: 'Project';
      readonly accountId: string;
      readonly machineId: string;
      readonly projectId: string;
    }
  | {
      readonly _tag: 'Machine';
      readonly accountId: string;
      readonly machineId: string;
    };

/** Whether a row went, by whose it is: its Account's and Machine's, and its Project's when it has one. */
export const went =
  (gone: Gone) =>
  (row: {
    readonly accountId: string;
    readonly machineId: string;
    readonly projectId: string | null;
  }): boolean =>
    row.accountId === gone.accountId &&
    row.machineId === gone.machineId &&
    (gone._tag === 'Machine' || row.projectId === gone.projectId);

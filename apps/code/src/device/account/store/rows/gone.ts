/*
 * What the user asked to go from this device at once: a Project removed,
 * or a Connection forgotten, told as one thing to every store that keeps
 * something of it (`dropEverywhere`, in the Connection's store), each judging
 * its own rows by whose they are, deleting what of its own went and
 * leaving what it never kept.
 */

/** A Project removed, or a Connection forgotten. */
export type Gone =
  | {
      readonly _tag: 'Project';
      readonly accountId: string;
      readonly connectionId: string;
      readonly projectId: string;
    }
  | {
      readonly _tag: 'Connection';
      readonly accountId: string;
      readonly connectionId: string;
    };

/** Whether a row went, by whose it is: its Account's and Connection's, and its Project's when it has one. */
export const went =
  (gone: Gone) =>
  (row: {
    readonly accountId: string;
    readonly connectionId: string;
    readonly projectId: string | null;
  }): boolean =>
    row.accountId === gone.accountId &&
    row.connectionId === gone.connectionId &&
    (gone._tag === 'Connection' || row.projectId === gone.projectId);

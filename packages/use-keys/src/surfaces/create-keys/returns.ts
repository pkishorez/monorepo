/** Whether `surface` is `id`, or a Surface inside it: whether `id` is Open. */
export const isOpen = (surface: string | null, id: string) =>
  surface === id || (surface?.startsWith(`${id}.`) ?? false);

/**
 * Where each opened Surface goes back to, the latest last. It never holds
 * the Active Surface: only the one each `open` left. A Surface the app
 * moves to by any other way forgets them all.
 */
export const createReturns = () => {
  let opened: Array<{ readonly id: string; readonly from: string | null }> = [];
  // The Surfaces open and close asked for, in order, so the app's echo of
  // each is not mistaken for a move of its own.
  let asked: Array<string | null> = [];

  return {
    /**
     * Whether to move to `id` from `surface`, or from the last move asked
     * for that has not arrived yet: not when `id` is already Open there.
     */
    open: (id: string, surface: string | null) => {
      const from = asked.length > 0 ? (asked.at(-1) ?? null) : surface;
      if (isOpen(from, id)) return false;
      opened.push({ id, from });
      asked.push(id);
      return true;
    },

    /**
     * Where closing `id` goes: back to where it was opened from, closing
     * every Surface opened after it. Nowhere when it was not opened.
     */
    close: (id: string) => {
      const at = opened.findLastIndex((entry) => entry.id === id);
      const entry = opened[at];
      if (entry === undefined) return undefined;
      opened = opened.slice(0, at);
      asked.push(entry.from);
      return { to: entry.from };
    },

    /** The app moved to `surface`: unless open or close asked, forget all. */
    moved: (surface: string | null) => {
      const at = asked.indexOf(surface);
      if (at === -1) {
        opened = [];
        asked = [];
      } else asked = asked.slice(at + 1);
    },

    forget: () => {
      opened = [];
      asked = [];
    },
  };
};

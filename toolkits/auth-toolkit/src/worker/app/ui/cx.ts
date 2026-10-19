/** Joins the class names that are set. */
export const cx = (
  ...names: ReadonlyArray<string | false | null | undefined>
) => names.filter(Boolean).join(' ');

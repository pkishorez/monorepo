/** What a dialog is made with. */
export type Options = {
  /** Its DOM id prefix and the source it reports under. */
  readonly id: string;
  readonly trigger: string;
  readonly triggerVariant?: 'default' | 'outline' | 'destructive';
  readonly title: string;
  readonly description: string;
  readonly actions: ReadonlyArray<{
    readonly label: string;
    readonly value: string;
    readonly variant?: 'default' | 'outline' | 'destructive';
  }>;
};

export const idsOf = (options: Options) => ({
  trigger: `${options.id}-trigger`,
  panel: `${options.id}-panel`,
  title: `${options.id}-title`,
});

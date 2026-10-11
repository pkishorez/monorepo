// What a Walkthrough's takes can do to the app while it is recorded. Every
// click glides the visible cursor to its target first. `within` is the
// label of what a button is in, such as one rocket's pad or the Devtools; times are seconds from the
// start of the beat.
export type Stage = {
  click: (name: string | RegExp, within?: string) => Promise<void>;
  clicks: (
    name: string | RegExp,
    times: number,
    within?: string,
    gap?: number,
  ) => Promise<void>;
  /** Clicks a tab of the devtools. */
  tab: (name: 'Timeline' | 'Inspector') => Promise<void>;
  /** Presses a key, and shows it in a badge. */
  press: (key: string, label: string) => Promise<void>;
  /** Waits until `seconds` into the beat. */
  at: (seconds: number) => Promise<void>;
};

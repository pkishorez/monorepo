import type {
  FinalWord,
  ProvisionalWord,
  TimedWord,
  Word,
} from '../transcript/index.ts';

/**
 * The words of a session as the rolling window advances. Final words are
 * appended once and never touched; provisional words are replaced wholesale
 * by each pass.
 */
export class RollingWords {
  private readonly finalWords: Array<FinalWord> = [];
  private provisional: Array<ProvisionalWord> = [];
  /** Audio-clock time up to which words are final; the next window starts here. */
  private frozenUntil = 0;

  get windowStart(): number {
    return this.frozenUntil;
  }

  /** Skips ahead when the unfrozen stretch would exceed the window. */
  capWindow(now: number, windowSeconds: number): void {
    if (now - this.frozenUntil > windowSeconds) {
      this.frozenUntil = now - windowSeconds;
    }
  }

  /**
   * Takes a pass's words; those ending before `freezeBefore` become final.
   * The next window starts at the first provisional word's start, so the
   * model hears that word from its beginning next time. Only when nothing
   * is provisional does the edge move to the last final word's end.
   */
  accept(words: ReadonlyArray<Word>, freezeBefore: number): void {
    const next: Array<ProvisionalWord> = [];
    let lastFinalEnd = this.frozenUntil;
    for (const word of words) {
      if (word.start < this.frozenUntil) continue;
      if (next.length === 0 && word.end <= freezeBefore) {
        this.finalWords.push({ ...word, final: true });
        lastFinalEnd = Math.max(lastFinalEnd, word.end);
      } else {
        next.push({ ...word, final: false });
      }
    }
    this.provisional = next;
    this.frozenUntil = Math.max(
      this.frozenUntil,
      next.length > 0 ? next[0]!.start : lastFinalEnd,
    );
  }

  /** Nothing to hear: drop provisional words without moving the window. */
  clearProvisional(): void {
    this.provisional = [];
  }

  /** Freezes everything, for the last pass after the microphone stops. */
  freezeAll(): void {
    for (const word of this.provisional) {
      this.finalWords.push({ ...word, final: true });
    }
    this.provisional = [];
  }

  get all(): ReadonlyArray<TimedWord> {
    return [...this.finalWords, ...this.provisional];
  }
}

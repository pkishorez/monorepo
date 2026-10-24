/*
 * The One Euro filter (Casiez, Roussel and Vogel, 2012): a low-pass filter
 * whose cutoff rises with speed, so a still hand stops jittering and a fast
 * one does not lag. Tuned for points 0 to 1 across the image.
 */

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuro {
  private value: number | null = null;
  private speed = 0;
  private at = 0;

  constructor(
    private readonly minCutoff = 1.5,
    private readonly beta = 6,
    private readonly speedCutoff = 1,
  ) {}

  /** The filtered value of `x`, seen at `at` ms. */
  next(x: number, at: number): number {
    if (this.value === null) {
      this.value = x;
      this.at = at;
      return x;
    }
    const dt = Math.max((at - this.at) / 1000, 1e-3);
    this.at = at;
    const rawSpeed = (x - this.value) / dt;
    this.speed += alpha(this.speedCutoff, dt) * (rawSpeed - this.speed);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.speed);
    this.value += alpha(cutoff, dt) * (x - this.value);
    return this.value;
  }
}

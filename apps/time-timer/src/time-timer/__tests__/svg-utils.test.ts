import { CONFIG, getDurationAngle } from "../svg-utils";

describe("svg related math", () => {
  it("Duration less than 0 should throw error", () => {
    expect(() => getDurationAngle(-1)).toThrowError();
  });

  it("duration greater than max should throw error", () => {
    expect(() =>
      getDurationAngle(CONFIG.MAX_DURATION_IN_MINUTES + 1),
    ).toThrowError();
  });

  it("0 time to 0 angle", () => {
    const angle = getDurationAngle(0);

    expect(angle).toBe(0);
  });

  it("1/2 time => half angle 360/2", () => {
    const angle = getDurationAngle(CONFIG.MAX_DURATION_IN_MINUTES / 2);

    expect(angle).toBe(180);
  });
});

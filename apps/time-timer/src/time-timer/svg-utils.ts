import invariant from "tiny-invariant";
import { CONFIG } from "../config";

export const getDurationAngle = (duration: number) => {
  invariant(duration >= 0, "Duration should be zero or positive");
  invariant(duration <= CONFIG.MAX_DURATION_IN_MINUTES, "Duration too long");

  return Math.round((duration / CONFIG.MAX_DURATION_IN_MINUTES) * 360);
};
export { CONFIG };

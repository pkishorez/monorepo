import { describe, expect, test } from "vitest";
import {
  getMaxVersion,
  getMaxVersionFromRange,
  getMinVersionFromRange,
} from "../version.js";
import { versions } from "./constants.js";

describe("topic: version", () => {
  test("version range test", () => {
    // Min version cannot go below the ^|~ range defined as per semver
    expect(getMinVersionFromRange("^1.4.1", versions)).toBe("1.4.1");
    expect(getMinVersionFromRange("~1.5.0", versions)).toBe("1.5.0");

    expect(getMaxVersionFromRange("^1.0.0", versions)).toBe("1.5.0");
    expect(getMaxVersionFromRange("~1.0.0", versions)).toBe("1.0.3");
  });
  test("version max", () => {
    expect(getMaxVersion(versions)).toBe("3.0.0");
  });
});

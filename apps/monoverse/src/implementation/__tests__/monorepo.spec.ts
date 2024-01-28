import fixtures from "fixturez";
import path from "path";
import invariant from "tiny-invariant";
import { describe, expect, test } from "vitest";
import { getMonorepo } from "..";

const f = fixtures(__dirname);

describe("monorepo", () => {
  test("find monorepo from root path", () => {
    const filePath = f.copy("basic");
    const packages = [
      "dir1-pkg1",
      "dir1-pkg2",
      "dir2-pkg1",
      "dir2-pkg2",
    ].sort();

    const monorepo = getMonorepo(filePath);

    invariant(monorepo, "monorepo should be defined");
    const monorepoWorkspaces = monorepo.workspaces.map((v) => v.name).sort();

    expect(monorepoWorkspaces).toStrictEqual(packages);
  });

  test("find monorepo from nested path even when it is invalid", () => {
    let filePath = f.copy("basic");
    filePath = path.resolve(filePath, "di1/pk1");

    const packages = [
      "dir1-pkg1",
      "dir1-pkg2",
      "dir2-pkg1",
      "dir2-pkg2",
    ].sort();

    const monorepo = getMonorepo(filePath);

    invariant(monorepo, "monorepo should be defined");
    const monorepoWorkspaces = monorepo.workspaces.map((v) => v.name).sort();

    expect(monorepoWorkspaces).toStrictEqual(packages);
  });

  test("find a single workspace when no monorepo found", () => {
    const filePath = f.copy("single");

    const monorepo = getMonorepo(filePath);
    invariant(monorepo, "monorepo should be defined");

    expect(monorepo.workspaces.map((v) => v.name)).toStrictEqual([
      "single-package",
    ]);
  });
});

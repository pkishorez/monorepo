import os from "os";
import path from "path";
import fs from "fs";

const homeDir = os.homedir();

const getGitRoot = (cwd: string): string | null => {
  let dir = cwd;
  while (true) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

export const computePaths = (cwd: string) => {
  const absolutePath = cwd;
  const homePath = cwd.startsWith(homeDir) ? "~" + cwd.slice(homeDir.length) : cwd;
  const gitRoot = getGitRoot(cwd);
  const gitPath = gitRoot
    ? (() => {
        const rootName = path.basename(gitRoot);
        const rel = path.relative(gitRoot, cwd);
        return rel ? `${rootName}/${rel}` : rootName;
      })()
    : homePath;
  return { absolutePath, homePath, gitPath };
};

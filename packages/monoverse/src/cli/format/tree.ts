import * as path from "node:path";
import { theme as c } from "../../theme.js";

export type TreeItem = {
  path: string;
  name?: string;
};

export type TreeOptions = {
  root?: string;
  cwd?: string;
};

interface TreeNode {
  segment: string;
  fullPath: string;
  isWorkspace: boolean;
  workspaceName: string | undefined;
  children: Map<string, TreeNode>;
}

const BOX = {
  branch: "├── ",
  lastBranch: "└── ",
  vertical: "│   ",
  empty: "    ",
} as const;

function findCommonAncestor(paths: string[]): string {
  if (paths.length === 0) return "/";

  const firstPath = paths[0];
  if (firstPath === undefined) return "/";
  if (paths.length === 1) return path.dirname(firstPath);

  const segments = paths.map((p) => p.split(path.sep));
  const firstSegments = segments[0];
  if (firstSegments === undefined) return "/";

  const minLength = Math.min(...segments.map((s) => s.length));

  const commonParts: string[] = [];
  for (let i = 0; i < minLength; i++) {
    const segment = firstSegments[i];
    if (segment === undefined) break;
    if (segments.every((s) => s[i] === segment)) {
      commonParts.push(segment);
    } else {
      break;
    }
  }

  return commonParts.join(path.sep) || "/";
}

function buildTree(items: TreeItem[], commonAncestor: string): TreeNode {
  const root: TreeNode = {
    segment: path.basename(commonAncestor) || commonAncestor,
    fullPath: commonAncestor,
    isWorkspace: false,
    workspaceName: undefined,
    children: new Map(),
  };

  for (const item of items) {
    const relativePath = path.relative(commonAncestor, item.path);
    const segments = relativePath.split(path.sep).filter(Boolean);

    let current = root;
    let currentPath = commonAncestor;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment === undefined) continue;

      currentPath = path.join(currentPath, segment);
      const isLast = i === segments.length - 1;

      let node = current.children.get(segment);
      if (node === undefined) {
        node = {
          segment,
          fullPath: currentPath,
          isWorkspace: false,
          workspaceName: undefined,
          children: new Map(),
        };
        current.children.set(segment, node);
      }

      if (isLast) {
        node.isWorkspace = true;
        node.workspaceName = item.name;
      }
      current = node;
    }
  }

  return root;
}

function renderTree(
  node: TreeNode,
  cwd: string | undefined,
  prefix: string,
  isLast: boolean,
  isRoot: boolean,
): string {
  const lines: string[] = [];
  const isCwd = cwd !== undefined && node.fullPath === cwd;

  if (isRoot) {
    const cwdMarker = isCwd ? ` ${c.warning}(cwd)${c.reset}` : "";
    lines.push(`${c.muted}${node.segment}${c.reset}${cwdMarker}`);
  } else {
    const branch = isLast ? BOX.lastBranch : BOX.branch;
    const cwdMarker = isCwd ? ` ${c.warning}(cwd)${c.reset}` : "";

    if (node.isWorkspace) {
      const name = node.workspaceName
        ? `${c.accent}(${node.workspaceName})${c.reset}`
        : "";
      lines.push(
        `${prefix}${branch}${c.primary}${node.segment}${c.reset} ${name}${cwdMarker}`,
      );
    } else {
      lines.push(
        `${prefix}${branch}${c.muted}${node.segment}${c.reset}${cwdMarker}`,
      );
    }
  }

  const children = Array.from(node.children.values());
  const sortedChildren = children.sort((a, b) => {
    if (a.isWorkspace === b.isWorkspace) {
      return a.segment.localeCompare(b.segment);
    }
    return a.isWorkspace ? 1 : -1;
  });

  for (let i = 0; i < sortedChildren.length; i++) {
    const child = sortedChildren[i];
    if (child === undefined) continue;

    const childIsLast = i === sortedChildren.length - 1;
    const newPrefix = isRoot ? "" : prefix + (isLast ? BOX.empty : BOX.vertical);

    lines.push(renderTree(child, cwd, newPrefix, childIsLast, false));
  }

  return lines.join("\n");
}

export function formatToTree(items: TreeItem[], options?: TreeOptions): string {
  if (items.length === 0) return "";

  const root = options?.root ?? process.cwd();
  const cwd = options?.cwd;

  const absolutePaths = items.map((item) => ({
    ...item,
    path: path.isAbsolute(item.path) ? item.path : path.resolve(root, item.path),
  }));

  const allPaths = absolutePaths.map((item) => item.path);
  const commonAncestor = findCommonAncestor(allPaths);

  const tree = buildTree(absolutePaths, commonAncestor);
  return renderTree(tree, cwd, "", true, true);
}

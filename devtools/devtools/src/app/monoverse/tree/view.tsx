import { useCallback, useMemo, useRef } from 'react';
import { View } from '@kestack/kabuki/react';

import {
  ancestorsOf,
  buildTree,
  foldersToReveal,
  isIgnored,
  isWithin,
  visibleRows,
  withDeleted,
  type Leaf,
  type TreeNode,
} from '../model/index.js';
import { TreeLive } from './actor.js';
import { Outline, type TreeActions } from './outline/index.js';
import { useBrokenCounts, useConnections } from './lenses/connections/index.js';
import { useChanges } from './lenses/git/index.js';

/*
 * The tree drawn, as Outline: everything it draws is worked out here from
 * the Model and the Props, once per change to what it reads, never on a
 * pan or a zoom.
 */

export const TreeView = View.make(TreeLive, ({ root, model, props, send }) => {
  const {
    base,
    name,
    files,
    packages,
    links,
    broken,
    sourceRoots,
    changes,
    unchanged,
  } = props;
  const { selected } = model;

  // Every file drawn, deleted ones included while Changes is on.
  const every = useMemo(() => withDeleted(files, changes), [files, changes]);
  const tree = useMemo(() => {
    const leaves: Array<Leaf> = [
      ...every.map((path) => ({
        path,
        kind: 'file' as const,
      })),
      ...packages.map(({ path, name, version }) => ({
        path,
        kind: 'package' as const,
        label: name,
        ...(version === undefined ? {} : { version }),
      })),
    ];
    return buildTree(base, leaves, name);
  }, [base, name, every, packages]);

  const openSet = useMemo(() => new Set(model.open), [model.open]);
  const isOpen = useCallback((path: string) => openSet.has(path), [openSet]);

  // Ignored files always show, dimmed; connections and Violations are
  // always drawn. While Changes is on, what the branch left unchanged is
  // drawn as it is, faded, or not at all.
  const changeOf = useChanges(changes);
  const hiding = changes !== null && unchanged === 'hide';
  const rows = useMemo(() => {
    const all = visibleRows(tree, isOpen);
    return hiding ? all.filter(({ node }) => changeOf.has(node.path)) : all;
  }, [tree, isOpen, hiding, changeOf]);
  const faded = useCallback(
    (path: string) =>
      changes !== null && unchanged === 'dim' && !changeOf.has(path),
    [changes, unchanged, changeOf],
  );
  const connections = useConnections(tree, isOpen, selected, links, broken);
  const brokenCounts = useBrokenCounts(broken);
  // A selection keeps in front itself, what is inside it, what it connects
  // to, and the folders holding those; the rest steps back.
  const dimmed = useMemo(() => {
    if (selected === null) return () => false;
    const kept = new Set<string>([selected, ...ancestorsOf(selected)]);
    for (const path of connections.keys())
      for (const at of [path, ...ancestorsOf(path)]) kept.add(at);
    return (path: string) => !kept.has(path) && !isWithin(path, selected);
  }, [selected, connections]);
  const ignored = useCallback(
    (path: string) => isIgnored(path, sourceRoots),
    [sourceRoots],
  );

  // Read by the actions as they run, so nothing draws again for them.
  const latest = useRef({ selected, links, every });
  latest.current = { selected, links, every };
  const actions = useMemo<TreeActions>(
    () => ({
      select: (path) => send({ _tag: 'Selected', path }),
      toggle: (path) => send({ _tag: 'Toggled', path }),
      activate: (node: TreeNode) =>
        send(
          node.kind === 'folder'
            ? { _tag: 'Toggled', path: node.path }
            : node.kind === 'file'
              ? { _tag: 'Opened', path: node.path }
              : { _tag: 'Entered', path: node.path },
        ),
      view: (node: TreeNode) =>
        send(
          node.kind === 'file'
            ? { _tag: 'Opened', path: node.path }
            : node.kind === 'package'
              ? { _tag: 'Entered', path: node.path }
              : {
                  _tag: 'Viewed',
                  path: node.path,
                  files: latest.current.every.filter((path) =>
                    isWithin(path, node.path),
                  ),
                },
        ),
      reveal: (path) => {
        const { selected: from, links: all } = latest.current;
        if (from === null) return;
        send({ _tag: 'Revealed', folders: foldersToReveal(path, from, all) });
      },
    }),
    [send],
  );

  return (
    <div {...root} className="relative h-full min-h-0 w-full">
      {rows.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">
          {hiding ? 'Nothing changed here.' : 'Nothing to show.'}
        </p>
      ) : (
        <Outline
          scope={packages.length > 0 ? 'repo' : 'package'}
          tree={tree}
          open={openSet}
          rows={rows}
          selected={selected}
          connections={connections}
          broken={brokenCounts}
          changes={changeOf}
          changesOn={changes !== null}
          dimmed={dimmed}
          faded={faded}
          ignored={ignored}
          actions={actions}
        />
      )}
    </div>
  );
});

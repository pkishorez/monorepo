import { useCallback, useMemo, useRef } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';

import { isWithin } from '../../../../../../../server/rpc/contract/index.js';
import { ancestorsOf, isIgnored } from '../../../../logic/shared/index.js';
import {
  buildTree,
  visibleRows,
  withDeleted,
  type Leaf,
  type TreeNode,
} from '../logic/shared/index.js';
import { foldersToReveal, type TreeShape } from '../logic/shared/index.js';
import {
  useConnections,
  useFindings,
  useSelectionFindings,
} from './lenses/connections.js';
import { useChanges } from './lenses/git.js';
import { Outline, type TreeActions } from './outline/outline.js';

/*
 * The tree drawn, as Outline: everything it draws is worked out here from
 * the Model and the Props, once per change to what it reads, never on a
 * pan or a zoom.
 */

export function Body({
  root,
  model,
  props,
  send,
}: ViewPropsOf<typeof TreeShape>) {
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
    ignored: ignoredShown,
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

  // Ignored files show dimmed, unless they are left out; connections and
  // what is wrong are always drawn. While Changes is on, what the branch left
  // unchanged is drawn as it is, faded, or not at all.
  const changeOf = useChanges(changes);
  const hiding = changes !== null && unchanged === 'hide';
  const rows = useMemo(() => {
    const all = visibleRows(tree, isOpen);
    return all.filter(
      ({ node }) =>
        (!hiding || changeOf.has(node.path)) &&
        (ignoredShown || !isIgnored(node.path, sourceRoots)),
    );
  }, [tree, isOpen, hiding, changeOf, ignoredShown, sourceRoots]);
  const faded = useCallback(
    (path: string) =>
      changes !== null && unchanged === 'dim' && !changeOf.has(path),
    [changes, unchanged, changeOf],
  );
  // The folders inside each folder holding folders, at any depth; and
  // every folder, for opening or closing them all.
  const foldersInside = useMemo(() => {
    const inside = new Map<string, Array<string>>();
    const all: Array<string> = [];
    const walk = (node: TreeNode): Array<string> => {
      const found: Array<string> = [];
      for (const child of node.children) {
        if (child.kind !== 'folder') continue;
        found.push(child.path, ...walk(child));
      }
      if (found.length > 0) inside.set(node.path, found);
      return found;
    };
    all.push(...walk(tree.root));
    return { inside, all };
  }, [tree]);
  const folding = useMemo(() => {
    const allOpen = (paths: ReadonlyArray<string>) =>
      paths.every((path) => openSet.has(path));
    return {
      all: allOpen(foldersInside.all),
      inside: (path: string) => {
        const inside = foldersInside.inside.get(path);
        return inside === undefined
          ? null
          : openSet.has(path) && allOpen(inside);
      },
    };
  }, [foldersInside, openSet]);
  // Whether the tree is as it opened: the default view, nothing selected.
  const atHome = useMemo(
    () =>
      selected === null &&
      model.home.length === openSet.size &&
      model.home.every((path) => openSet.has(path)),
    [selected, model.home, openSet],
  );
  const connections = useConnections(tree, isOpen, selected, links, broken);
  const findings = useFindings(broken, packages);
  const selectionFindings = useSelectionFindings(
    selected,
    base,
    broken,
    packages,
  );
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
  const latest = useRef({
    selected,
    links,
    every,
    open: openSet,
    foldersInside,
    folding,
  });
  latest.current = {
    selected,
    links,
    every,
    open: openSet,
    foldersInside,
    folding,
  };
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
      changes: (node: TreeNode) =>
        send({
          _tag: 'Viewed',
          path: node.path,
          files: latest.current.every.filter((path) =>
            isWithin(path, node.path),
          ),
        }),
      toggleAll: () => {
        const { folding, foldersInside } = latest.current;
        send({
          _tag: 'OpenChosen',
          open: folding.all ? [] : foldersInside.all,
        });
      },
      reset: () => send({ _tag: 'Reset' }),
      toggleInside: (path) => {
        const { open, folding, foldersInside } = latest.current;
        const inside = foldersInside.inside.get(path) ?? [];
        const next = new Set(open);
        if (folding.inside(path) === true)
          for (const folder of inside) next.delete(folder);
        else for (const folder of [path, ...inside]) next.add(folder);
        send({ _tag: 'OpenChosen', open: [...next] });
      },
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
          findings={findings}
          selectionFindings={selectionFindings}
          changes={changeOf}
          changesOn={changes !== null}
          dimmed={dimmed}
          faded={faded}
          ignored={ignored}
          folding={folding}
          atHome={atHome}
          actions={actions}
        />
      )}
    </div>
  );
}

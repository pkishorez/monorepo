import { useCallback, useMemo, useRef } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { Button } from '@kestack/web-platform/ui/components/button';

import { isWithin } from '../../../../../../../server/rpc/contract/index.js';
import { ancestorsOf, isIgnored } from '../../../../logic/shared/index.js';
import {
  buildTree,
  focusOf,
  focusedTree,
  leavesOf,
  opensAround,
  shownLinks,
  trailOf,
  visibleRows,
  withDeleted,
  type Leaf,
  type TreeNode,
} from '../logic/shared/index.js';
import { foldersToReveal, type TreeShape } from '../logic/shared/index.js';
import {
  useConnections,
  useFindings,
  useLinkKinds,
  useSelectionFindings,
} from './lenses/connections.js';
import { useChanges } from './lenses/git.js';
import { Outline, type TreeActions } from './outline/outline.js';

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
    excepted,
    shown,
    outside,
    sourceRoots,
    changes,
    unchanged,
    ignored: ignoredShown,
  } = props;
  const { selected } = model;

  const every = useMemo(() => withDeleted(files, changes), [files, changes]);
  const leaves = useMemo(
    (): ReadonlyArray<Leaf> => [
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
    ],
    [every, packages],
  );
  const whole = useMemo(
    () => buildTree(base, leaves, name),
    [base, name, leaves],
  );
  const focus = focusOf(whole, model.focus);
  const kinds = useLinkKinds(broken, excepted);
  const drawnLinks = useMemo(
    () => shownLinks(links, kinds, shown),
    [links, kinds, shown],
  );
  const tree = useMemo(
    () => focusedTree(whole, leaves, focus, drawnLinks, outside),
    [whole, leaves, focus, drawnLinks, outside],
  );

  const openSet = useMemo(() => new Set(model.open), [model.open]);
  const isOpen = useMemo(() => {
    const around = opensAround(focus, outside);
    return (path: string) => openSet.has(path) || around(path);
  }, [openSet, focus, outside]);
  const isOutside = useCallback(
    (path: string) => focus !== null && !isWithin(path, focus),
    [focus],
  );
  const leafFolders = useMemo(
    () => (packages.length > 0 ? new Set<string>() : leavesOf(base, links)),
    [packages, base, links],
  );
  const trail = useMemo(
    () => (focus === null ? null : trailOf(whole, focus, name)),
    [whole, focus, name],
  );

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
      isOutside(path) ||
      (changes !== null && unchanged === 'dim' && !changeOf.has(path)),
    [changes, unchanged, changeOf, isOutside],
  );
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
  const atHome = useMemo(
    () =>
      selected === null &&
      model.home.length === openSet.size &&
      model.home.every((path) => openSet.has(path)),
    [selected, model.home, openSet],
  );
  const connections = useConnections(tree, isOpen, selected, drawnLinks, kinds);
  const findings = useFindings(broken, excepted, packages);
  const selectionFindings = useSelectionFindings(
    selected,
    base,
    broken,
    excepted,
    packages,
  );
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

  const latest = useRef({
    selected,
    links: drawnLinks,
    every,
    open: openSet,
    foldersInside,
    folding,
  });
  latest.current = {
    selected,
    links: drawnLinks,
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
            ? { _tag: 'Focused', path: node.path }
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
      focus: (path) => send({ _tag: 'Focused', path }),
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
        <p className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          {hiding ? 'Nothing changed here.' : 'Nothing to show.'}
          {focus === null ? null : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => send({ _tag: 'Focused', path: null })}
            >
              Show all of {name}
            </Button>
          )}
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
          shown={shown}
          leaves={leafFolders}
          trail={trail}
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

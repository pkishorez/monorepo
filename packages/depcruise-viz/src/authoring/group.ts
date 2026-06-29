import type { LayerStack } from '../types.js';

/**
 * Stamps a group name onto each stack and returns them, ready to spread into
 * `rules`. Stacks sharing a group render inside one labeled region and form an
 * isolated unit — layer identity is namespaced per group, so the same layer
 * name in another group is a distinct layer.
 *
 * A wrapper over the per-stack `group` config field; it does not nest. Passing
 * a stack that already declares a different group is an error.
 *
 * @example
 *   rules: [
 *     ...group('db', [dynamodbArchitecture, sqliteStructure]),
 *     ...group('core', [coreStructure]),
 *   ]
 */
export function group(name: string, stacks: LayerStack[]): LayerStack[] {
  if (name.length === 0) {
    throw new Error('Group name must not be empty');
  }
  if (stacks.length === 0) {
    throw new Error(`Group "${name}" must contain at least one stack`);
  }
  return stacks.map((stack) => {
    const existing = stack.config.group;
    if (existing !== undefined && existing !== name) {
      throw new Error(
        `Stack "${stack.name}" is already in group "${existing}"; cannot reassign to "${name}"`,
      );
    }
    return { ...stack, config: { ...stack.config, group: name } };
  });
}

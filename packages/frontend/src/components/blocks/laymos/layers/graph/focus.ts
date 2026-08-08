import { resolveLayerFocus } from '../focus';
import type { LayerInteraction, LayerRule, LayerViolationPair } from '../model';

export interface GraphFocus {
  readonly focusedLayerId?: string;
  readonly hoveredRelatedLayerId?: string;
  readonly highlightedLayerIds: ReadonlySet<string>;
  readonly highlightedRuleIds: ReadonlySet<string>;
  readonly emphasizedRuleIds: ReadonlySet<string>;
  readonly violationRuleId?: string;
}

export function ruleId(fromLayerId: string, toLayerId: string): string {
  return `${fromLayerId}\0${toLayerId}`;
}

export function resolveGraphFocus({
  rules,
  activeLayerId,
  hoveredLayerId,
  activeViolationPair,
}: Pick<LayerInteraction, 'activeLayerId' | 'hoveredLayerId'> & {
  readonly rules: readonly LayerRule[];
  readonly activeViolationPair?: LayerViolationPair;
}): GraphFocus {
  if (activeViolationPair !== undefined) {
    return {
      highlightedLayerIds: new Set([
        activeViolationPair.fromLayerId,
        activeViolationPair.toLayerId,
      ]),
      highlightedRuleIds: new Set(),
      emphasizedRuleIds: new Set(),
      violationRuleId: ruleId(
        activeViolationPair.fromLayerId,
        activeViolationPair.toLayerId,
      ),
    };
  }

  const focusedId = resolveLayerFocus({
    activeLayerId,
    hoveredLayerId,
  }).focusedLayerId;
  if (focusedId === undefined) {
    return {
      highlightedLayerIds: new Set(),
      highlightedRuleIds: new Set(),
      emphasizedRuleIds: new Set(),
    };
  }

  const highlightedLayerIds = new Set([focusedId]);
  const highlightedRuleIds = new Set<string>();
  for (const rule of rules) {
    for (const toLayerId of rule.toLayerIds) {
      if (rule.fromLayerId !== focusedId && toLayerId !== focusedId) continue;
      highlightedLayerIds.add(rule.fromLayerId);
      highlightedLayerIds.add(toLayerId);
      highlightedRuleIds.add(ruleId(rule.fromLayerId, toLayerId));
    }
  }

  const hoveredRelatedLayerId =
    activeLayerId !== undefined &&
    hoveredLayerId !== undefined &&
    hoveredLayerId !== activeLayerId &&
    highlightedLayerIds.has(hoveredLayerId)
      ? hoveredLayerId
      : undefined;
  const activeRelatedLayerId = activeLayerId;
  const emphasizedRuleIds =
    hoveredRelatedLayerId === undefined || activeRelatedLayerId === undefined
      ? highlightedRuleIds
      : new Set(
          [...highlightedRuleIds].filter(
            (id) =>
              id === ruleId(activeRelatedLayerId, hoveredRelatedLayerId) ||
              id === ruleId(hoveredRelatedLayerId, activeRelatedLayerId),
          ),
        );

  return {
    focusedLayerId: focusedId,
    hoveredRelatedLayerId,
    highlightedLayerIds,
    highlightedRuleIds,
    emphasizedRuleIds,
  };
}

import type { EntityType } from "@std-toolkit/core";
import { projectClaudeMessage } from "./core/projection/claude-message.js";
import { projectCodexEvent } from "./agents/codex/projection.js";

const registry: Record<
  string,
  (entity: EntityType<any>) => EntityType<any> | null
> = {
  claudeMessage: projectClaudeMessage as (
    entity: EntityType<any>,
  ) => EntityType<any> | null,
  codexEvent: projectCodexEvent as (
    entity: EntityType<any>,
  ) => EntityType<any> | null,
};

export function applyProjection(
  entity: EntityType<any>,
): EntityType<any> | null {
  const fn = registry[entity.meta._e];
  return fn ? fn(entity) : entity;
}

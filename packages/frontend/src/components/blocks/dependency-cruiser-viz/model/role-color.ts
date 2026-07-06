import type { ModuleRole } from './modules';

/**
 * Single source of truth for connectivity-role color-coding on the canvas,
 * shared by the layer-card chips and the focus-view nodes so a module's state
 * reads the same everywhere.
 *
 * The role is a faint background wash on the chip rather than a leading dot (it
 * stole indentation) or an underline (visually noisy): `root` and `leaf` get a
 * subtle tint, `normal` none, and `dead` carries no wash at all — it's conveyed
 * by dimming + italic. The file tree deliberately does NOT use these; there a
 * module is flagged by a single amber accent, independent of its role.
 */
export const ROLE_WASH: Record<ModuleRole, string | null> = {
  root: 'bg-emerald-500/15',
  leaf: 'bg-violet-500/15',
  dead: null,
  normal: null,
};

/** Legend swatch color per role, for the small role keys in panel footers. */
export const ROLE_SWATCH: Record<ModuleRole, string> = {
  root: 'bg-emerald-500',
  leaf: 'bg-violet-500',
  dead: 'bg-rose-500',
  normal: 'bg-muted-foreground',
};

export const ROLE_TITLE: Record<ModuleRole, string> = {
  root: 'root — imports others, nothing imports it',
  leaf: 'leaf — imported by others, imports nothing',
  dead: 'dead — neither imports nor is imported',
  normal: '',
};

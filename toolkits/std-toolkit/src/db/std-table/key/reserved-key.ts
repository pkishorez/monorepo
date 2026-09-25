/**
 * Earlier releases wrote a snapshot item under this Entity name. Keep it out
 * of table scans while existing physical tables can still contain that item.
 */
export const LEGACY_BASELINE_ENTITY = '__std_toolkit_enforcement__';

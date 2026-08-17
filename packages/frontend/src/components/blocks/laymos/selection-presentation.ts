// Selection is the loudest state on the canvas, so it is the only thing that
// glows: a filled surface plus a primary bloom, which dimming cannot imitate.
export const selectedNodeClass =
  'border-[2.5px] border-primary bg-primary/10 ring-[3px] ring-primary/35 shadow-[0_0_28px_-4px_var(--primary)]';

// A container holds its own contents, so it carries the same glow at a weight
// that does not drown the Modules inside it.
export const selectedContainerClass =
  'border-primary bg-primary/[0.07] ring-1 ring-primary/40 shadow-[0_0_32px_-6px_var(--primary)]';

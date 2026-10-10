// What the narrator says, one line per Scene, in the Explainer Format's order.
export const script = [
  {
    id: 'hook',
    say: 'Every codebase has an architecture diagram. And almost every one of them is lying.',
  },
  {
    id: 'familiar-world',
    say: 'You draw the boxes on day one. The interface talks to features, features talk to services, and nothing reaches back up.',
  },
  {
    id: 'disruption',
    say: 'Then someone ships on a Friday. One quiet import skips a layer. Nobody notices, and the diagram keeps smiling.',
  },
  {
    id: 'mechanism',
    say: 'Laymos moves that diagram out of your head and into one config file. Layers own folders. Modules draw borders inside them. Rules say who may depend on whom.',
  },
  {
    id: 'discovery',
    say: 'Then it reads your real imports and compares. The moment code crosses a line that the config never allowed, lint fails and points at the exact file.',
  },
  {
    id: 'consequence',
    say: 'So the architecture you drew is the architecture you have. Reviews argue about design, not about stray imports.',
  },
  {
    id: 'recap',
    say: 'Declare the layers. Let laymos check every import. Keep the diagram honest.',
  },
] as const;

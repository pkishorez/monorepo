import { Story } from 'laymos/story';
import { eschemaEvolution } from './eschema-evolution.story.js';

export default Story.group({
  title: 'std-toolkit',
  description: 'Database-agnostic sync over single-table item collections.',
  markdown: `
std-toolkit layers a synchronizable data toolkit over any database that can
store sorted items in a single table. Schemas evolve in place, snapshots
capture state, and sync flows move changes between peers.

The groups below walk through each capability with executable stories.
  `,
  children: [
    Story.group({
      title: 'ESchema',
      description: 'Versioned entity schemas that migrate old data forward.',
      markdown: `
\`EntityESchema\` declares an entity's shape per version. Every \`evolve\`
step records how to migrate the previous version forward, so decoding any
historical payload yields the latest shape.
      `,
      children: [eschemaEvolution],
    }),
  ],
});

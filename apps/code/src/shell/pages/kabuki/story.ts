import type { Story } from '@kestack/web-platform/recipes/devtools';

/*
 * A Story about code, as an agent would write one from its Blueprint and
 * History: why the Dictation's machines Worker is still running. It plays
 * on code's own History in this tab.
 */

export const machinesStory: Story = {
  question: 'Why is the dictation’s machines Worker still running?',
  scenes: [
    {
      at: { message: 'Arrived' },
      card: '',
      with: ['page'],
      title: 'One tree, one root',
      say: 'Everything in code is an Instance in one tree. Router, Start’s root, holds code’s own App as its Child, page. Every answer starts from here.',
    },
    {
      at: { message: 'KeyboardRead', to: 'page', before: true },
      card: 'page',
      part: { kind: 'state', name: 'Reading' },
      with: [''],
      title: 'page starts in Reading',
      say: 'page has two States, Reading and Ready, and starts in Reading. The Children written at its top, as account, are already here; the ones written in Ready, as dictation, are not yet.',
    },
    {
      at: { message: 'KeyboardRead', to: 'page', before: true },
      card: 'page',
      part: { kind: 'worker', name: 'read' },
      title: 'Reading runs one Worker',
      say: 'read is written in Reading, so it runs only while Reading lasts. It asks Device State for your keys and Vim Mode.',
    },
    {
      at: { message: 'KeyboardRead', to: 'page', before: true },
      card: 'page',
      part: { kind: 'message', name: 'KeyboardRead', state: 'Reading' },
      title: 'read sends KeyboardRead',
      say: 'When the keys are read, read sends KeyboardRead to page. Reading has a rule for it: go to Ready.',
    },
    {
      at: { message: 'KeyboardRead', to: 'page' },
      card: 'page',
      part: { kind: 'state', name: 'Ready' },
      title: 'page moves to Ready',
      say: 'The rule runs: page leaves Reading for Ready. Leaving Reading stops read; entering Ready starts what Ready holds.',
    },
    {
      at: { message: 'KeyboardRead', to: 'page' },
      card: 'page',
      part: { kind: 'child', name: 'dictation' },
      with: ['page/dictation'],
      title: 'Ready invokes dictation',
      say: 'Entering Ready invokes its Children, dictation among them. Written in Ready, dictation exists for exactly as long as page stays in Ready.',
    },
    {
      at: { message: 'KeyboardRead', to: 'page' },
      card: 'page/dictation',
      part: { kind: 'worker', name: 'machines' },
      title: 'dictation starts machines',
      say: 'machines is written at the top of dictation, in no State, with no Condition: it starts the moment dictation exists and runs for as long as it does.',
    },
    {
      at: { message: 'KeyboardRead', to: 'page' },
      card: 'page/dictation',
      part: { kind: 'requires', name: 'Machines' },
      title: 'It listens to the Machines Service',
      say: 'machines reads Machines, a Service: no Actor in the tree provides it; code’s Layer hands it in from above the root. It waits for Machines to say something new.',
    },
    {
      at: { message: 'MachinesHeard', to: 'page/dictation', changed: true },
      card: 'page/dictation',
      part: { kind: 'model' },
      title: 'What it does while it runs',
      say: 'Each time Machines changes, machines sends MachinesHeard, and the rule writes listed and machines into dictation’s Model. That is all it does.',
    },
    {
      card: 'page/dictation',
      part: { kind: 'worker', name: 'machines' },
      with: ['page'],
      title: 'So it is still running',
      say: 'machines runs because dictation exists, and dictation exists because page is in Ready. It stops only when page leaves Ready, or when dictation is gone.',
    },
  ],
};

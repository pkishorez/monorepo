import type { Story } from '@kestack/devtools-kabuki/inspector';

/*
 * A Story about code, as an agent would write one from its Blueprint and
 * History: why the Dictation's machines Worker is still running. Kept as
 * data: the Inspector, reading code only through the Kabuki Session Api,
 * plays no Story for now.
 */

export const machinesStory: Story = {
  question: 'Why is the dictation’s machines Worker still running?',
  scenes: [
    {
      at: { message: 'Arrived' },
      card: '',
      with: ['page'],
      title: 'One tree, one root',
      say: 'Everything in code is an Instance in one tree. Router, Start’s root, holds code’s own App as its Child, page: the Device. Every answer starts from here.',
    },
    {
      at: { message: 'KeptRead', to: 'page/machines' },
      card: 'page/machines',
      part: { kind: 'child', name: 'voice' },
      with: ['page'],
      title: 'machines holds voice, always',
      say: 'page runs one machines for each Account it knows. machines holds voice in no State and with no Condition, so voice, and dictation under it, live as long as the Account does, whatever page is open.',
    },
    {
      at: { message: 'KeptRead', to: 'page/machines' },
      card: 'page/machines/voice/dictation',
      part: { kind: 'worker', name: 'machines' },
      with: ['page/machines/voice'],
      title: 'dictation starts machines',
      say: 'machines is written at the top of dictation, in no State, with no Condition: it starts the moment dictation exists and runs for as long as it does.',
    },
    {
      at: { message: 'KeptRead', to: 'page/machines' },
      card: 'page/machines/voice/dictation',
      part: { kind: 'requires', name: 'Machines' },
      title: 'It listens to the Machines Service',
      say: 'machines reads Machines, a Service the Device provides from its Layer: what every Machine of the Account says. It waits for Machines to say something new.',
    },
    {
      at: {
        message: 'MachinesHeard',
        to: 'page/machines/voice/dictation',
        changed: true,
      },
      card: 'page/machines/voice/dictation',
      part: { kind: 'model' },
      title: 'What it does while it runs',
      say: 'Each time Machines changes, machines sends MachinesHeard, and the rule writes listed and machines into dictation’s Model. That is all it does.',
    },
    {
      card: 'page/machines/voice/dictation',
      part: { kind: 'worker', name: 'machines' },
      with: ['page/machines'],
      title: 'So it is still running',
      say: 'machines runs because dictation exists, and dictation exists because its Account’s machines does. It stops only when that Account is signed out or pruned.',
    },
  ],
};

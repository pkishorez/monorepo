import type { Story } from '@kestack/devtools-kabuki/inspector';

/*
 * A Story about code, as an agent would write one from its Blueprint and
 * History: why the Dictation's connections Worker is still running. Kept as
 * data: the Inspector, reading code only through the Kabuki Session Api,
 * plays no Story for now.
 */

export const connectionsStory: Story = {
  question: 'Why is the dictation’s connections Worker still running?',
  scenes: [
    {
      at: { message: 'Arrived' },
      card: '',
      with: ['page'],
      title: 'One tree, one root',
      say: 'Everything in code is an Instance in one tree. Router, Start’s root, holds code’s own App as its Child, page: the Device. Every answer starts from here.',
    },
    {
      at: { message: 'KeptRead', to: 'page/connections' },
      card: 'page/connections',
      part: { kind: 'child', name: 'voice' },
      with: ['page'],
      title: 'connections holds voice, always',
      say: 'page runs one connections for each Account it knows. connections holds voice in no State and with no Condition, so voice, and dictation under it, live as long as the Account does, whatever page is open.',
    },
    {
      at: { message: 'KeptRead', to: 'page/connections' },
      card: 'page/connections/voice/dictation',
      part: { kind: 'worker', name: 'connections' },
      with: ['page/connections/voice'],
      title: 'dictation starts connections',
      say: 'connections is written at the top of dictation, in no State, with no Condition: it starts the moment dictation exists and runs for as long as it does.',
    },
    {
      at: { message: 'KeptRead', to: 'page/connections' },
      card: 'page/connections/voice/dictation',
      part: { kind: 'requires', name: 'Connections' },
      title: 'It listens to the Connections Service',
      say: 'connections reads Connections, a Service the Device provides from its Layer: what every Connection of the Account says. It waits for Connections to say something new.',
    },
    {
      at: {
        message: 'ConnectionsHeard',
        to: 'page/connections/voice/dictation',
        changed: true,
      },
      card: 'page/connections/voice/dictation',
      part: { kind: 'model' },
      title: 'What it does while it runs',
      say: 'Each time Connections changes, connections sends ConnectionsHeard, and the rule writes listed and connections into dictation’s Model. That is all it does.',
    },
    {
      card: 'page/connections/voice/dictation',
      part: { kind: 'worker', name: 'connections' },
      with: ['page/connections'],
      title: 'So it is still running',
      say: 'connections runs because dictation exists, and dictation exists because its Account’s connections does. It stops only when that Account is signed out or pruned.',
    },
  ],
};

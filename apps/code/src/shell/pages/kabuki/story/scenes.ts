/*
 * A Story: what an agent writes to walk someone through an Actor tree. It
 * is only data, each Scene pointing at one part of the Blueprint by its
 * path and saying one thing about it, so the page draws it the same way
 * every time and an agent never draws anything. This one is written by
 * hand, as an agent would from the Blueprint, about code's root.
 */

/** The part of an Actor a Scene points at; none for the whole Actor. */
export type Part =
  | { readonly kind: 'state'; readonly name: string }
  | { readonly kind: 'worker'; readonly name: string }
  | { readonly kind: 'message'; readonly name: string; readonly state?: string }
  | { readonly kind: 'child'; readonly name: string }
  | { readonly kind: 'requires' }
  | { readonly kind: 'provides' };

export interface Scene {
  /** The Blueprint path of the Actor: `''` for the root, else slot names joined by `/`. */
  readonly path: string;
  readonly part?: Part;
  /** The State to show it in, as if it were in it. */
  readonly in?: string;
  readonly title: string;
  readonly say: string;
}

export interface Story {
  readonly title: string;
  readonly scenes: ReadonlyArray<Scene>;
}

export const shellStory: Story = {
  title: 'How code starts, and how a dictation runs',
  scenes: [
    {
      path: '',
      title: 'One tree, one root',
      say: 'Everything on screen is an Instance in one tree. Start’s Router holds code’s own root, App, the Shell. It has two States, Reading and Ready, and everything else hangs off it.',
    },
    {
      path: '',
      in: 'Reading',
      part: { kind: 'worker', name: 'read' },
      title: 'It starts in Reading',
      say: 'Nothing is drawn yet. The read Worker is written in Reading, so it runs only while Reading lasts. It asks Device State for your keys and Vim Mode.',
    },
    {
      path: '',
      in: 'Reading',
      part: { kind: 'message', name: 'KeyboardRead', state: 'Reading' },
      title: 'One Message moves it on',
      say: 'read sends KeyboardRead. Reading has a rule for it: go to Ready. Leaving Reading closes the read Worker.',
    },
    {
      path: '',
      in: 'Ready',
      part: { kind: 'worker', name: 'accounts' },
      title: 'Some work never stops',
      say: 'accounts is written at the top, outside any State, so it runs for the whole life of the Shell. Each time who is signed in changes, it sends Signed.',
    },
    {
      path: '',
      in: 'Ready',
      part: { kind: 'requires' },
      title: 'What it may use',
      say: 'The Shell’s own code reaches only the Capabilities it requires. The app’s Layer hands them in: Device State, Accounts, Machines and the rest.',
    },
    {
      path: '',
      in: 'Ready',
      part: { kind: 'provides' },
      title: 'What it hands down',
      say: 'The Shell also provides Capabilities to everything under it: the Account signed in, and how each Machine is reached. Children use them without knowing where they come from.',
    },
    {
      path: '',
      in: 'Ready',
      part: { kind: 'state', name: 'Ready' },
      title: 'Ready brings the Children',
      say: 'Entering Ready invokes its Children: the sidebar, the header, the pickers and the dictation. They exist only while Ready lasts.',
    },
    {
      path: '',
      in: 'Ready',
      part: { kind: 'child', name: 'machines' },
      title: 'A Child with a condition',
      say: 'machines exists only while someone is signed in, and is keyed by the Account. Switch Accounts and a fresh one is invoked in its place.',
    },
    {
      path: 'dictation',
      in: 'Idle',
      title: 'Into the Dictation',
      say: 'The Dictation has six States: Idle, Waiting, Recording, Transcribing, Failed and Done. It is in Idle until you press the mic.',
    },
    {
      path: 'dictation',
      in: 'Idle',
      part: { kind: 'message', name: 'Toggle', state: 'Idle' },
      title: 'You press the mic',
      say: 'The press reaches the Dictation as Toggle. In Idle, Toggle counts a new dictation and moves to Waiting while the browser asks for the microphone.',
    },
    {
      path: 'dictation',
      in: 'Recording',
      part: { kind: 'worker', name: 'record' },
      title: 'A Worker per recording',
      say: 'record is an each Worker: it runs once per recording, only while the State is Recording. Leave Recording and it stops, and the microphone closes with it.',
    },
    {
      path: 'dictation',
      in: 'Transcribing',
      part: { kind: 'worker', name: 'transcribe' },
      title: 'Then the words',
      say: 'Stopping moves it to Transcribing, where transcribe sends the clip to a Machine. Said brings the text, and Done holds it until a Draft takes it.',
    },
  ],
};

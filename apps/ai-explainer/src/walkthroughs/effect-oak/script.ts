// What the narrator says, chapter by chapter, in the order the Rockets demo
// builds up.
export const script = [
  {
    id: 'actor-model',
    say: "Effect Oak starts with an Actor. An Actor holds a Model: here, a rocket's fuel. It accepts Messages: Fuel and Drain. And an update turns a Model and a Message into the next Model.",
  },
  {
    id: 'actor-view',
    say: "To draw it, write a View. It's plain React: it takes the Model, and sends Messages when you click.",
  },
  {
    id: 'states-accept',
    say: "A rocket can't refuel in the air, or land on the pad. So an Actor can have States, and each State decides which Messages it accepts.",
  },
  {
    id: 'states-lifetime',
    say: 'A State can also run work while it lasts. In flight, a Lifetime burns fuel. Land, and it stops on its own. Run dry, and the rocket is Lost.',
  },
  {
    id: 'many-list',
    say: 'One rocket is never enough. The Launch Site keeps a list of rockets in its Model, and Actor.many turns each one into its own live Actor.',
  },
  {
    id: 'many-children',
    say: "States decide Children too. Only a rocket in flight has boosters. They fire, separate, and they're gone.",
  },
  {
    id: 'capabilities-requires',
    say: "Rockets shouldn't own the weather. The Launch Site Provides Weather, and each Rocket Requires it. Leave it out, and it won't compile.",
  },
  {
    id: 'capabilities-command',
    say: 'Checking the sky is a Command: an Effect the update asks for, using any service it Requires. Storm? The launch is scrubbed.',
  },
  {
    id: 'motion',
    say: "And it's just React, so Motion glides the rocket from the pad to the sky.",
  },
  {
    id: 'time-log',
    say: 'Every click was a Message, and every Message is in the Log. Launch with too little fuel, and the rocket is Lost.',
  },
  {
    id: 'time-branch',
    say: 'Step back, and it floats back to the pad, animations and all. Branch off from before the launch, fuel up, and try again. Both histories, side by side.',
  },
  {
    id: 'deeper-lifetimes',
    say: 'Lifetimes come in two kinds: one for the whole Instance, one for a single State. Both are optional.',
  },
  {
    id: 'deeper-commands',
    say: 'Commands are keyed. Launch twice, and the countdown restarts. Abort cancels it mid-count.',
  },
  {
    id: 'deeper-rendering',
    say: 'Updates are surgical: only the View whose Actor changed renders again.',
  },
  {
    id: 'deeper-replay',
    say: "The Messages alone rebuild the whole app. Replay runs no side effects. Once it's done, Lifetimes start again for whatever is live.",
  },
  {
    id: 'deeper-inspector',
    say: 'And the Inspector maps it all: every Actor, every State, how many Instances each has, and what every Message changed.',
  },
  { id: 'close', say: 'Effect Oak.' },
] as const;

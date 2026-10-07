import { useState } from 'react';

import { Button } from '#components/ui/button';

import { LocalSignIn, type LocalSignInChoice } from './index';

const presets: LocalSignInChoice[] = [
  { email: 'ada@example.com', name: 'Ada Lovelace' },
  { email: 'grace@example.com', name: 'Grace Hopper' },
];

/** Opens on demand and shows who was chosen, like an app's local sign-in. */
function Live({ presets }: { presets: ReadonlyArray<LocalSignInChoice> }) {
  const [open, setOpen] = useState(true);
  const [chosen, setChosen] = useState<LocalSignInChoice | null>(null);

  return (
    <div className="flex flex-col items-start gap-3 p-6 text-sm">
      <Button onClick={() => setOpen(true)}>Sign in</Button>
      <p className="text-muted-foreground">
        {chosen ? `Signed in as ${chosen.name ?? chosen.email}` : 'Signed out'}
      </p>
      <LocalSignIn
        open={open}
        presets={presets}
        onChoose={(choice) => {
          setChosen(choice);
          setOpen(false);
        }}
        onCancel={() => {
          setChosen(null);
          setOpen(false);
        }}
      />
    </div>
  );
}

export default {
  presets: <Live presets={presets} />,
  'one preset': <Live presets={presets.slice(0, 1)} />,
  'no presets': <Live presets={[]} />,
};

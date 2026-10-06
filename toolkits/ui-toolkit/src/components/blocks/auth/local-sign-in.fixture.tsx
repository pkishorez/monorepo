import { useState } from 'react';

import { Button } from '#components/ui/button';

import { LocalSignIn, type LocalSignInChoice } from './auth-screens';
import { signedInAccounts } from './fixtures/data';

const presets: LocalSignInChoice[] = signedInAccounts.map(({ name, email }) =>
  name ? { email, name } : { email },
);

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

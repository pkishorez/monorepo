import { useState } from 'react';

import { Button } from '#components/ui/button';

import { MockSignIn, type MockSignInChoice } from './auth-screens';
import { signedInAccounts } from './fixtures/data';

const presets: MockSignInChoice[] = signedInAccounts.map(({ name, email }) =>
  name ? { email, name } : { email },
);

/** Opens on demand and shows who was chosen, like an app's mocked sign-in. */
function Live({ presets }: { presets: ReadonlyArray<MockSignInChoice> }) {
  const [open, setOpen] = useState(true);
  const [chosen, setChosen] = useState<MockSignInChoice | null>(null);

  return (
    <div className="flex flex-col items-start gap-3 p-6 text-sm">
      <Button onClick={() => setOpen(true)}>Sign in</Button>
      <p className="text-muted-foreground">
        {chosen ? `Signed in as ${chosen.name ?? chosen.email}` : 'Signed out'}
      </p>
      <MockSignIn
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

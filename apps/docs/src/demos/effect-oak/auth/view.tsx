import { View } from 'effect-oak/react';
import { Spinner } from '@kstackz/web-platform/components/spinner';
import { Auth } from './auth.js';
import { LoggedInView } from './logged-in/index.js';
import { LoggedOutView } from './logged-out/index.js';

export const AuthView = View.make(Auth, ({ _tag, children }) =>
  _tag === 'Checking' ? (
    <div className="flex size-full items-center justify-center">
      <Spinner />
    </div>
  ) : (
    <div className="size-full overflow-y-auto">
      {_tag === 'LoggedOut' ? (
        <LoggedOutView instance={children.pages} />
      ) : (
        <LoggedInView instance={children.pages} />
      )}
    </div>
  ),
);

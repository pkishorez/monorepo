import { View } from 'effect-oak/react';
import { Spinner } from '@kstackz/web-platform/components/spinner';
import { Auth } from './auth.js';
import { LoggedInView } from './logged-in/index.js';
import { LoggedOutView } from './logged-out/index.js';

export const AuthView = View.make(Auth, {
  Checking: () => (
    <div className="flex size-full items-center justify-center">
      <Spinner />
    </div>
  ),
  LoggedOut: ({ children }) => (
    <div className="size-full overflow-y-auto">
      <LoggedOutView node={children.pages} />
    </div>
  ),
  LoggedIn: ({ children }) => (
    <div className="size-full overflow-y-auto">
      <LoggedInView node={children.pages} />
    </div>
  ),
});

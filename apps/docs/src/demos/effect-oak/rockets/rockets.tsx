import type { ReactNode } from 'react';
import { Shell } from '../shell/index.js';
import { APPS, type AppName } from './apps.js';

export const NAMES = Object.keys(APPS) as ReadonlyArray<AppName>;

const TITLES: Record<AppName, string> = {
  actor: 'An Actor',
  state: 'States and Workers',
  fleet: 'A Fleet',
  capabilities: 'Capabilities',
};

/** One of the four Rockets apps, beside its devtools: `?app=actor|state|fleet|capabilities`. */
export const Rockets = ({
  app,
  menu,
  onApp,
}: {
  readonly app: AppName;
  readonly menu: ReactNode;
  readonly onApp: (next: AppName) => void;
}) => (
  <Shell
    key={app}
    app={APPS[app]}
    menu={
      <>
        {menu}
        <nav className="ml-auto flex gap-1 text-sm">
          {NAMES.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={name === app}
              onClick={() => onApp(name)}
              className="rounded-md px-2.5 py-1 text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
            >
              {TITLES[name]}
            </button>
          ))}
        </nav>
      </>
    }
  />
);

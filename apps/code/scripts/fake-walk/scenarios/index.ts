import type { Walk } from '../walker.ts';
import { accounts } from './accounts.ts';
import { attachments } from './attachments.ts';
import { branches } from './branches.ts';
import { computers } from './computers.ts';
import { connections } from './connections.ts';
import { devtools } from './devtools.ts';
import { folders } from './folders.ts';
import { fresh } from './fresh.ts';
import { home } from './home.ts';
import { pickers } from './pickers.ts';
import { projects } from './projects.ts';
import { reach } from './reach.ts';
import { reload } from './reload.ts';
import { repos } from './repos.ts';
import { sessions } from './sessions.ts';
import { settings } from './settings.ts';
import { sidebar } from './sidebar.ts';
import { tunnels } from './tunnels.ts';

/** One flow of the app, walked from where the scenarios it needs left it. */
export interface Scenario {
  readonly name: string;
  readonly title: string;
  /** The scenarios that must have walked first, by name. */
  readonly needs: ReadonlyArray<string>;
  readonly run: (walk: Walk) => Promise<void>;
}

/** Every scenario, in the order a walk takes them. */
export const scenarios: ReadonlyArray<Scenario> = [
  home,
  projects,
  sessions,
  branches,
  attachments,
  computers,
  settings,
  tunnels,
  connections,
  folders,
  repos,
  reach,
  pickers,
  sidebar,
  devtools,
  reload,
  accounts,
  fresh,
];

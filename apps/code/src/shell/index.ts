import { Shell as page, ShellLive } from './actor.ts';
import { ShellView } from './view.tsx';

export const Shell = { page, actor: ShellLive, view: ShellView };

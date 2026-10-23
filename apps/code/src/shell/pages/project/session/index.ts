import { Session as page, SessionLive } from './actor.ts';
import { Folder } from './transcript/index.ts';
import { SessionView } from './view.tsx';

export const Session = { page, actor: SessionLive, view: SessionView, Folder };

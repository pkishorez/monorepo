import { keeping, Kept, messages, none } from './files.ts';

/*
 * The files a session's agent shows: what its page keeps of their File
 * Tickets, and asks (`files.ts`), each File Embed drawn where it was
 * written (`embed.tsx`), and the viewer one opens in (`viewer.tsx`).
 */
export const Files = { Kept, none, messages, keeping };
export { type Embed, type Entry, keyOf, wants } from './files.ts';
export { drawEmbed, type Embeds, EmbedsContext } from './embed.tsx';
export { FileViewer } from './viewer.tsx';

import { Context } from 'effect';
import type { KabukiSessionClient } from '../../api/index.ts';

/*
 * The one Capability the Inspector Requires: a Kabuki Session to read and
 * act on, as a Kabuki Session Api client. Whoever places the Inspector
 * Provides it: the in-page dock one answered in memory by the app beside
 * it, DevTools' `/kabuki` page one that reaches a tab through DevTools.
 */

export class KabukiSession extends Context.Service<
  KabukiSession,
  KabukiSessionClient
>()('@kestack/devtools-kabuki/KabukiSession') {}

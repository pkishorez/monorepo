import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { Member } from '../../contracts/member/index.ts';
import { Api } from '../capabilities/index.ts';

/**
 * Where a member with no GitHub connection lands: one next step, Connect
 * GitHub. Drawn by the Worker with the member in it, then followed live in
 * the browser, so a rename, or another account after an Account Switch,
 * shows here at once.
 */
export const Welcome = Page.define({
  path: '/',
  // The member the page was drawn for; null for a visitor Console turns away.
  data: Schema.Struct({ member: Schema.NullOr(Member) }),
  requires: [Api],
  model: Schema.Struct({
    /** The member as their User Space last said; null until it has. */
    member: Schema.NullOr(Member),
  }),
  message: Schema.TaggedUnion({ MemberSeen: { member: Member } }),
});

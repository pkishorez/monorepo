import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { Api, PageData } from '../../api/index.ts';
import { titled } from '../metadata.ts';
import { followPageAccounts } from '../shown.ts';

/*
 * Where better-auth sends a sign-in that failed: what happened, and the
 * way back, keeping `return_to`.
 */
export const ErrorPage = Page.define({
  path: '/error',
  query: {
    error: Schema.optionalKey(Schema.String),
    error_description: Schema.optionalKey(Schema.String),
    return_to: Schema.optionalKey(Schema.String),
  },
  render: 'dynamic',
  data: PageData,
  metadata: (_, data) => titled("Sign-in didn't finish")(data),
  requires: [Api],
});

export const ErrorPageLive = ErrorPage.build({
  workers: {
    // Another tab changed who is signed in: loaded anew once shown again.
    accounts: {
      run: (self) => followPageAccounts(self),
    },
  },
});

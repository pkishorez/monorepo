import { Schema } from 'effect';
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { Authz } from '@kestack/auth-toolkit';
import { ownerOnly } from '../access/index.ts';

/*
 * What the HTTP Worker answers, shared by the Worker and the browser's
 * client: one endpoint per level of access. `GET /public` for anyone,
 * `GET /authenticated` for any signed-in Account (401 otherwise), and
 * `GET /authorized` for the owner (403 for anyone else signed in).
 */

export class HelloApi extends HttpApi.make('hello').add(
  HttpApiGroup.make('greetings')
    .add(HttpApiEndpoint.get('public', '/public', { success: Schema.String }))
    .add(
      HttpApiEndpoint.get('authenticated', '/authenticated', {
        success: Schema.String,
      }).pipe(Authz.required),
    )
    .add(
      HttpApiEndpoint.get('authorized', '/authorized', {
        success: Schema.String,
      }).pipe(ownerOnly),
    ),
) {}

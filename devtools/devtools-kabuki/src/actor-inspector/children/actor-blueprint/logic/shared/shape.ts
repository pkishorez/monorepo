import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { BlueprintNode } from '../../../../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../../../../../services/kabuki-session/contract/index.ts';

export const BlueprintShape = Actor.define('Blueprint', {
  description: 'Every Actor the app’s root can grow, running or not',
  requires: [KabukiSession],
  model: {
    root: Schema.NullOr(BlueprintNode),
    opened: Schema.Array(Schema.String),
    problem: Schema.NullOr(Schema.String),
  },
  message: {
    Printed: { root: BlueprintNode },
    Failed: { problem: Schema.String },
    Opened: { id: Schema.String, open: Schema.Boolean },
  },
});

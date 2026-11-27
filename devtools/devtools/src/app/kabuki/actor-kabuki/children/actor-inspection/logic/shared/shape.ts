import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Sessions } from '../../../../../services/sessions/contract/index.js';

const Tab = Schema.Literals(['inspector', 'story']);

export const InspectionShape = Actor.define('Inspection', {
  description:
    'One Kabuki Session reached through the DevTools Server, shown as its Inspector or its Story',
  requires: [Sessions],
  input: Schema.Struct({ name: Schema.String, app: Schema.String }),
  props: Schema.UndefinedOr(Schema.Struct({ tab: Tab })),
  model: Schema.Struct({ name: Schema.String, app: Schema.String }),
});

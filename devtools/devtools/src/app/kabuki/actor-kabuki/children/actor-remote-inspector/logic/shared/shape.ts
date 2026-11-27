import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Sessions } from '../../../../../services/sessions/contract/index.js';

export const RemoteInspectorShape = Actor.define('RemoteInspector', {
  requires: [Sessions],
  input: Schema.Struct({ name: Schema.String }),
  model: Schema.Struct({ name: Schema.String }),
});

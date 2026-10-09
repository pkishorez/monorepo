import { Schema } from 'effect';
import { Node } from 'effect-oak';

/** A Node whose Update throws on its one Message, to see what a crash does. */
export const CrashDemo = Node.make('CrashDemo', {
  message: Schema.TaggedUnion({ ClickedCrash: {} }),
}).build({
  update: {
    ClickedCrash: () => {
      throw new Error('This is a simulated crash!');
    },
  },
});

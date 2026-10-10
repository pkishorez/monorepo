import { Schema } from 'effect';
import { Actor } from 'effect-oak';

/** An Actor whose Update throws on its one Message, to see what a crash does. */
export const CrashDemo = Actor.make('CrashDemo', {
  message: Schema.TaggedUnion({ ClickedCrash: {} }),
}).build({
  update: {
    ClickedCrash: () => {
      throw new Error('This is a simulated crash!');
    },
  },
});

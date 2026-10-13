import { View } from '@kestack/kabuki/react';
import { SignInActor } from './sign-in.ts';

export const SignInView = View.make(SignInActor, ({ model, send, root }) => (
  <form
    {...root}
    className="flex flex-col gap-3"
    onSubmit={(event) => {
      event.preventDefault();
      send({ _tag: 'Submitted' });
    }}
  >
    <label className="flex flex-col gap-1.5 text-[13px] font-medium">
      Your name
      <input
        value={model.name}
        onChange={(event) => send({ _tag: 'Named', name: event.target.value })}
        className="h-9 rounded-lg border border-border bg-background px-3 text-base font-normal outline-offset-1 focus-visible:outline-2 focus-visible:outline-ring sm:text-[13px]"
      />
    </label>
    <button
      type="submit"
      className="h-9 rounded-lg bg-primary text-[13px] font-medium text-primary-foreground transition-[background-color,scale] duration-150 hover:bg-primary/90 active:scale-[0.98]"
    >
      Sign in
    </button>
  </form>
));

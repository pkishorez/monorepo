import { View } from 'effect-oak/react';
import {
  Alert,
  AlertDescription,
} from '@kstackz/web-platform/components/alert';
import { Button } from '@kstackz/web-platform/components/button';
import { canSubmit, FieldViews, Waitlist } from './form.js';

export const WaitlistView = View.make(Waitlist, ({ model, children, send }) => (
  <div className="size-full overflow-y-auto p-6">
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-center text-2xl font-semibold">Join our waitlist</h1>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          send({ _tag: 'ClickedFormSubmit' });
        }}
      >
        <FieldViews.name node={children.name} />
        <FieldViews.email node={children.email} />
        <FieldViews.message node={children.message} />
        <Button type="submit" disabled={!canSubmit(model)}>
          {model.submission._tag === 'Submitting'
            ? 'Joining…'
            : 'Join waitlist'}
        </Button>
      </form>
      {model.submission._tag === 'SubmitSuccess' && (
        <Alert role="status">
          <AlertDescription>
            {model.submission.confirmationText}
          </AlertDescription>
        </Alert>
      )}
      {model.submission._tag === 'SubmitError' && (
        <Alert variant="destructive">
          <AlertDescription>{model.submission.error}</AlertDescription>
        </Alert>
      )}
    </div>
  </div>
));

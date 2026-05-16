import { Schema } from 'effect';
import { useAppForm } from '@monorepo/frontend/form';

const ContactSchema = Schema.standardSchemaV1(
  Schema.Struct({
    name: Schema.String.pipe(
      Schema.minLength(2, {
        message: () => 'Name must be at least 2 characters',
      }),
    ),
    email: Schema.String.pipe(
      Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
        message: () => 'Please enter a valid email',
      }),
    ),
    message: Schema.String.pipe(
      Schema.minLength(10, {
        message: () => 'Message must be at least 10 characters',
      }),
    ),
  }),
);

export function ContactDemo() {
  const form = useAppForm({
    defaultValues: { name: '', email: '', message: '' },
    validators: { onChange: ContactSchema },
    onSubmit: async ({ value }) =>
      alert(`Submitted:\n${JSON.stringify(value, null, 2)}`),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-4"
    >
      <form.AppField
        name="name"
        children={(field) => (
          <field.TextField label="Name" placeholder="Your name" required />
        )}
      />
      <form.AppField
        name="email"
        children={(field) => (
          <field.TextField
            label="Email"
            type="email"
            placeholder="you@example.com"
            required
          />
        )}
      />
      <form.AppField
        name="message"
        children={(field) => (
          <field.TextareaField
            label="Message"
            placeholder="How can we help?"
            rows={4}
            required
          />
        )}
      />
      <form.AppForm>
        <form.SubmitButton className="w-full">Send Message</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

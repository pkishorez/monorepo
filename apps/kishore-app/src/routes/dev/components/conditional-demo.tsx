import { Schema } from 'effect';
import { useAppForm } from '@monorepo/frontend/form';

const ConditionalSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    contactMethod: Schema.String.pipe(
      Schema.check(
        Schema.isMinLength(1, { message: 'Select a contact method' }),
      ),
    ),
    email: Schema.String,
    phone: Schema.String,
    preferredTime: Schema.String,
    hasDeadline: Schema.Boolean,
    deadline: Schema.UndefinedOr(Schema.Date),
    notes: Schema.String,
  }),
);

export function ConditionalDemo() {
  const form = useAppForm({
    defaultValues: {
      contactMethod: '' as string,
      email: '',
      phone: '',
      preferredTime: '',
      hasDeadline: false,
      deadline: undefined as Date | undefined,
      notes: '',
    },
    validators: { onChange: ConditionalSchema },
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
        name="contactMethod"
        children={(field) => (
          <field.SelectField
            label="Contact Method"
            placeholder="How should we reach you?"
            options={[
              { value: 'email', label: 'Email' },
              { value: 'phone', label: 'Phone' },
            ]}
            required
          />
        )}
      />

      <form.Subscribe
        selector={(s) => s.values.contactMethod}
        children={(method) => (
          <>
            {method === 'email' && (
              <form.AppField
                name="email"
                children={(field) => (
                  <field.TextField
                    label="Email Address"
                    type="email"
                    placeholder="you@example.com"
                    required
                  />
                )}
              />
            )}
            {method === 'phone' && (
              <>
                <form.AppField
                  name="phone"
                  children={(field) => (
                    <field.TextField
                      label="Phone Number"
                      placeholder="+1 (555) 123-4567"
                      required
                    />
                  )}
                />
                <form.AppField
                  name="preferredTime"
                  children={(field) => (
                    <field.SelectField
                      label="Preferred Call Time"
                      placeholder="When works best?"
                      options={[
                        { value: 'morning', label: 'Morning (9am–12pm)' },
                        { value: 'afternoon', label: 'Afternoon (12pm–5pm)' },
                        { value: 'evening', label: 'Evening (5pm–8pm)' },
                      ]}
                    />
                  )}
                />
              </>
            )}
          </>
        )}
      />

      <form.AppField
        name="hasDeadline"
        children={(field) => <field.SwitchField label="Has a deadline?" />}
      />

      <form.Subscribe
        selector={(s) => s.values.hasDeadline}
        children={(hasDeadline) =>
          hasDeadline ? (
            <form.AppField
              name="deadline"
              children={(field) => (
                <field.DatePickerField label="Deadline" required />
              )}
            />
          ) : null
        }
      />

      <form.AppField
        name="notes"
        children={(field) => (
          <field.TextareaField
            label="Additional Notes"
            placeholder="Anything else we should know?"
            rows={3}
          />
        )}
      />

      <form.AppForm>
        <form.SubmitButton className="w-full">Submit</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

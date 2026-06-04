import { Schema } from 'effect';
import { useAppForm } from '@monorepo/frontend/form';

const KitchenSinkSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    fullName: Schema.String.pipe(
      Schema.check(Schema.isMinLength(2, { message: 'Required' })),
    ),
    email: Schema.String.pipe(
      Schema.check(
        Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
          message: 'Invalid email',
        }),
      ),
    ),
    bio: Schema.String.pipe(
      Schema.check(Schema.isMaxLength(500, { message: 'Max 500 characters' })),
    ),
    role: Schema.String.pipe(
      Schema.check(Schema.isMinLength(1, { message: 'Select a role' })),
    ),
    startDate: Schema.UndefinedOr(Schema.Date),
    newsletter: Schema.Boolean,
    darkMode: Schema.Boolean,
    password: Schema.String.pipe(
      Schema.check(Schema.isMinLength(8, { message: 'At least 8 characters' })),
    ),
  }),
);

export function KitchenSinkDemo() {
  const form = useAppForm({
    defaultValues: {
      fullName: '',
      email: '',
      bio: '',
      role: '',
      startDate: undefined as Date | undefined,
      newsletter: false,
      darkMode: true,
      password: '',
    },
    validators: { onChange: KitchenSinkSchema },
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
      <div className="grid grid-cols-2 gap-4">
        <form.AppField
          name="fullName"
          children={(field) => (
            <field.TextField
              label="Full Name"
              placeholder="Jane Doe"
              required
            />
          )}
        />
        <form.AppField
          name="email"
          children={(field) => (
            <field.TextField
              label="Email"
              type="email"
              placeholder="jane@example.com"
              required
            />
          )}
        />
      </div>

      <form.AppField
        name="bio"
        children={(field) => (
          <field.TextareaField
            label="Bio"
            placeholder="Tell us about yourself..."
            description="Max 500 characters"
            rows={3}
            maxLength={500}
          />
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <form.AppField
          name="role"
          children={(field) => (
            <field.SelectField
              label="Role"
              placeholder="Select role"
              options={[
                { value: 'engineer', label: 'Engineer' },
                { value: 'designer', label: 'Designer' },
                { value: 'pm', label: 'Product Manager' },
                { value: 'other', label: 'Other' },
              ]}
              required
            />
          )}
        />
        <form.AppField
          name="startDate"
          children={(field) => (
            <field.DatePickerField
              label="Start Date"
              placeholder="Pick a date"
            />
          )}
        />
      </div>

      <form.AppField
        name="password"
        children={(field) => (
          <field.TextField
            label="Password"
            type="password"
            placeholder="Secure password"
            description="At least 8 characters"
            required
          />
        )}
      />

      <div className="flex items-center gap-8">
        <form.AppField
          name="newsletter"
          children={(field) => (
            <field.SwitchField label="Subscribe to newsletter" />
          )}
        />
        <form.AppField
          name="darkMode"
          children={(field) => <field.SwitchField label="Dark mode" />}
        />
      </div>

      <form.AppForm>
        <form.SubmitButton className="w-full">Save Profile</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

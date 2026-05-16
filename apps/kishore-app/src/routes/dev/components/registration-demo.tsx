import { Schema } from 'effect';
import { useAppForm } from '@monorepo/frontend/form';

const RegistrationSchema = Schema.standardSchemaV1(
  Schema.Struct({
    username: Schema.String.pipe(
      Schema.minLength(3, {
        message: () => 'Username must be at least 3 characters',
      }),
    ),
    email: Schema.String.pipe(
      Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
        message: () => 'Please enter a valid email',
      }),
    ),
    password: Schema.String.pipe(
      Schema.minLength(8, {
        message: () => 'Password must be at least 8 characters',
      }),
    ),
    confirmPassword: Schema.String,
    role: Schema.String.pipe(
      Schema.minLength(1, { message: () => 'Please select a role' }),
    ),
  }).pipe(
    Schema.filter((data) => {
      if (data.password !== data.confirmPassword) {
        return { path: ['confirmPassword'], message: 'Passwords do not match' };
      }
    }),
  ),
);

export function RegistrationDemo() {
  const form = useAppForm({
    defaultValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: '',
    },
    validators: { onChange: RegistrationSchema },
    onSubmit: async ({ value }) =>
      alert(`Registered:\n${JSON.stringify(value, null, 2)}`),
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
        name="username"
        children={(field) => (
          <field.TextField
            label="Username"
            placeholder="johndoe"
            description="This will be your public display name"
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
            placeholder="you@example.com"
            required
          />
        )}
      />
      <form.AppField
        name="password"
        children={(field) => (
          <field.TextField
            label="Password"
            type="password"
            placeholder="Enter a secure password"
            description="Must be at least 8 characters"
            required
          />
        )}
      />
      <form.AppField
        name="confirmPassword"
        children={(field) => (
          <field.TextField
            label="Confirm Password"
            type="password"
            placeholder="Re-enter your password"
            required
          />
        )}
      />
      <form.AppField
        name="role"
        children={(field) => (
          <field.SelectField
            label="Role"
            placeholder="Select a role"
            options={[
              { value: 'user', label: 'User' },
              { value: 'admin', label: 'Admin' },
              { value: 'moderator', label: 'Moderator' },
            ]}
            required
          />
        )}
      />
      <form.AppForm>
        <form.SubmitButton className="w-full">Create Account</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

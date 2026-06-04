import { Schema } from 'effect';
import { useAppForm } from '@monorepo/frontend/form';

const CustomErrorsSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    username: Schema.String.pipe(
      Schema.check(
        Schema.makeFilter((s) => {
          const errors: string[] = [];
          if (s.length < 3) errors.push('Too short — at least 3 characters');
          if (s.length > 20) errors.push('Too long — max 20 characters');
          if (s.length > 0 && !/^[a-z0-9_]+$/.test(s))
            errors.push('Only lowercase letters, numbers, and underscores');
          if (errors.length > 0) return errors;
        }),
      ),
    ),
    age: Schema.String.pipe(
      Schema.check(
        Schema.makeFilter((s) => {
          const n = Number(s);
          if (s === '') return 'Age is required';
          if (Number.isNaN(n)) return 'Must be a number';
          if (!Number.isInteger(n)) return 'Must be a whole number';
          const errors: string[] = [];
          if (n < 13) errors.push('Must be at least 13 years old');
          if (n > 150) errors.push("That doesn't seem right...");
          if (errors.length > 0) return errors;
        }),
      ),
    ),
    website: Schema.String.pipe(
      Schema.check(
        Schema.makeFilter((s) => {
          if (s === '') return undefined;
          try {
            new URL(s);
          } catch {
            return 'Enter a valid URL (e.g. https://example.com)';
          }
        }),
      ),
    ),
    coupon: Schema.String.pipe(
      Schema.check(
        Schema.makeFilter((s) => {
          if (s === '') return undefined;
          const errors: string[] = [];
          if (s.length !== 8)
            errors.push('Coupon codes are exactly 8 characters');
          if (!/^[A-Z0-9]+$/.test(s))
            errors.push('Use uppercase letters and numbers only');
          if (errors.length > 0) return errors;
        }),
      ),
    ),
  }),
);

export function CustomErrorsDemo() {
  const form = useAppForm({
    defaultValues: {
      username: '',
      age: '',
      website: '',
      coupon: '',
    },
    validators: { onChange: CustomErrorsSchema },
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
        name="username"
        children={(field) => (
          <field.TextField
            label="Username"
            placeholder="cool_user_42"
            description="Lowercase letters, numbers, and underscores only"
            required
          />
        )}
      />
      <form.AppField
        name="age"
        children={(field) => (
          <field.TextField
            label="Age"
            placeholder="25"
            description="Must be 13 or older"
            required
          />
        )}
      />
      <form.AppField
        name="website"
        children={(field) => (
          <field.TextField
            label="Website"
            placeholder="https://example.com"
            description="Optional — must be a full URL if provided"
          />
        )}
      />
      <form.AppField
        name="coupon"
        children={(field) => (
          <field.TextField
            label="Coupon Code"
            placeholder="SAVE2024"
            description="Optional — 8 uppercase alphanumeric characters"
          />
        )}
      />
      <form.AppForm>
        <form.SubmitButton className="w-full">Submit</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

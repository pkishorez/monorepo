import { Schema } from 'effect';
import { useAppForm } from '@monorepo/frontend/form';

const regionData: Record<string, { value: string; label: string }[]> = {
  us: [
    { value: 'ca', label: 'California' },
    { value: 'ny', label: 'New York' },
    { value: 'tx', label: 'Texas' },
    { value: 'wa', label: 'Washington' },
  ],
  uk: [
    { value: 'eng', label: 'England' },
    { value: 'sco', label: 'Scotland' },
    { value: 'wal', label: 'Wales' },
  ],
  in: [
    { value: 'ka', label: 'Karnataka' },
    { value: 'mh', label: 'Maharashtra' },
    { value: 'tn', label: 'Tamil Nadu' },
    { value: 'ts', label: 'Telangana' },
  ],
};

const DependentSchema = Schema.standardSchemaV1(
  Schema.Struct({
    country: Schema.String.pipe(
      Schema.minLength(1, { message: () => 'Select a country' }),
    ),
    region: Schema.String.pipe(
      Schema.minLength(1, { message: () => 'Select a region' }),
    ),
    city: Schema.String.pipe(
      Schema.minLength(2, { message: () => 'Enter a city' }),
    ),
    postalCode: Schema.String.pipe(
      Schema.minLength(3, { message: () => 'Enter a postal code' }),
    ),
  }),
);

export function DependentDemo() {
  const form = useAppForm({
    defaultValues: { country: '', region: '', city: '', postalCode: '' },
    validators: { onChange: DependentSchema },
    onSubmit: async ({ value }) =>
      alert(`Address:\n${JSON.stringify(value, null, 2)}`),
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
        name="country"
        children={(field) => (
          <field.SelectField
            label="Country"
            placeholder="Select country"
            options={[
              { value: 'us', label: 'United States' },
              { value: 'uk', label: 'United Kingdom' },
              { value: 'in', label: 'India' },
            ]}
            required
          />
        )}
      />

      <form.Subscribe
        selector={(s) => s.values.country}
        children={(country) => {
          const regions = regionData[country];
          if (!regions) return null;
          return (
            <form.AppField
              name="region"
              children={(field) => (
                <field.SelectField
                  label="Region / State"
                  placeholder="Select region"
                  options={regions}
                  required
                />
              )}
            />
          );
        }}
      />

      <div className="grid grid-cols-2 gap-4">
        <form.AppField
          name="city"
          children={(field) => (
            <field.TextField label="City" placeholder="City" required />
          )}
        />
        <form.AppField
          name="postalCode"
          children={(field) => (
            <field.TextField label="Postal Code" placeholder="12345" required />
          )}
        />
      </div>

      <form.AppForm>
        <form.SubmitButton className="w-full">Save Address</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

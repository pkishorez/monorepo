import { Schema } from 'effect';
import { Button } from '@monorepo/frontend/components/ui/button';
import { PlusIcon, XIcon } from '@monorepo/frontend/lucide';
import { Label } from '@monorepo/frontend/components/ui/label';
import { useAppForm } from '@monorepo/frontend/form';

const ArraySchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    projectName: Schema.String.pipe(
      Schema.check(
        Schema.isMinLength(2, { message: 'Project name is required' }),
      ),
    ),
    tags: Schema.Array(
      Schema.Struct({
        key: Schema.String.pipe(
          Schema.check(Schema.isMinLength(1, { message: 'Key is required' })),
        ),
        value: Schema.String.pipe(
          Schema.check(Schema.isMinLength(1, { message: 'Value is required' })),
        ),
      }),
    ),
  }),
);

export function ArrayDemo() {
  const form = useAppForm({
    defaultValues: {
      projectName: '',
      tags: [{ key: '', value: '' }] as readonly {
        readonly key: string;
        readonly value: string;
      }[],
    },
    validators: { onChange: ArraySchema },
    onSubmit: async ({ value }) =>
      alert(`Project:\n${JSON.stringify(value, null, 2)}`),
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
        name="projectName"
        children={(field) => (
          <field.TextField
            label="Project Name"
            placeholder="My Project"
            required
          />
        )}
      />

      <form.Subscribe
        selector={(s) => s.values.tags}
        children={(tags) => (
          <div className="space-y-3">
            <Label>Tags</Label>
            {tags.map((_, index) => (
              <div key={index} className="flex items-start gap-2">
                <form.AppField
                  name={`tags[${index}].key`}
                  children={(field) => <field.TextField placeholder="Key" />}
                />
                <form.AppField
                  name={`tags[${index}].value`}
                  children={(field) => <field.TextField placeholder="Value" />}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1"
                  disabled={tags.length <= 1}
                  onClick={() => {
                    const current = form.getFieldValue('tags');
                    form.setFieldValue(
                      'tags',
                      current.filter(
                        (_: { key: string; value: string }, i: number) =>
                          i !== index,
                      ),
                    );
                  }}
                >
                  <XIcon className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const current = form.getFieldValue('tags');
                form.setFieldValue('tags', [
                  ...current,
                  { key: '', value: '' },
                ]);
              }}
            >
              <PlusIcon className="size-4" />
              Add Tag
            </Button>
          </div>
        )}
      />

      <form.AppForm>
        <form.SubmitButton className="w-full">Create Project</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

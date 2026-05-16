import { createFormHook } from '@tanstack/react-form';

import { fieldContext, formContext } from './context.js';
import { TextField } from './fields/text-field.js';
import { TextareaField } from './fields/textarea-field.js';
import { SelectField } from './fields/select-field.js';
import { SwitchField } from './fields/switch-field.js';
import { DatePickerField } from './fields/date-picker-field.js';
import { SubmitButton } from './components/submit-button.js';

/**
 * Pre-configured form hook with all field and form components registered.
 *
 * @example
 * ```tsx
 * import { useAppForm } from "@monorepo/frontend/form"
 *
 * function MyForm() {
 *   const form = useAppForm({
 *     defaultValues: { email: "", message: "" },
 *     onSubmit: async ({ value }) => { ... },
 *   })
 *
 *   return (
 *     <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}>
 *       <form.AppField name="email" children={(field) => (
 *         <field.TextField label="Email" type="email" required />
 *       )} />
 *       <form.AppForm>
 *         <form.SubmitButton>Send</form.SubmitButton>
 *       </form.AppForm>
 *     </form>
 *   )
 * }
 * ```
 */
export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    TextareaField,
    SelectField,
    SwitchField,
    DatePickerField,
  },
  formComponents: {
    SubmitButton,
  },
});

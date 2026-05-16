/**
 * TanStack Form integration for @monorepo/frontend
 *
 * This module provides a schema-agnostic form primitive that integrates
 * TanStack Form with the existing UI components.
 *
 * @example
 * ```tsx
 * import { useAppForm } from "@monorepo/frontend/form"
 * import { z } from "zod" // Or any Standard Schema compliant library
 *
 * function ContactForm() {
 *   const form = useAppForm({
 *     defaultValues: { email: "", message: "" },
 *     validators: {
 *       onChange: z.object({
 *         email: z.string().email(),
 *         message: z.string().min(10)
 *       })
 *     },
 *     onSubmit: async ({ value }) => {
 *       console.log(value)
 *     },
 *   })
 *
 *   return (
 *     <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}>
 *       <form.AppField name="email" children={(field) => (
 *         <field.TextField label="Email" type="email" required />
 *       )} />
 *       <form.AppField name="message" children={(field) => (
 *         <field.TextareaField label="Message" required />
 *       )} />
 *       <form.AppForm>
 *         <form.SubmitButton>Send</form.SubmitButton>
 *       </form.AppForm>
 *     </form>
 *   )
 * }
 * ```
 */

// Main API
export { useAppForm, withForm } from './create-form-hook.js';

// Types
export type { FieldMeta, BaseFieldProps } from './types.js';
export type { TextFieldProps } from './fields/text-field.js';
export type { TextareaFieldProps } from './fields/textarea-field.js';
export type { SelectFieldProps, SelectOption } from './fields/select-field.js';
export type { SwitchFieldProps } from './fields/switch-field.js';
export type { DatePickerFieldProps } from './fields/date-picker-field.js';
export type { SubmitButtonProps } from './components/submit-button.js';

// Re-export formOptions for convenience
export { formOptions } from '@tanstack/react-form';

import { createFormHookContexts } from '@tanstack/react-form';

/**
 * Form hook contexts for TanStack Form integration.
 * These contexts allow field and form components to access their respective APIs.
 */
export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

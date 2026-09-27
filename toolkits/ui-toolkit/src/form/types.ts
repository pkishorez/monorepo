/**
 * Metadata about a form field's current state
 */
export interface FieldMeta {
  isTouched: boolean;
  isBlurred: boolean;
  isDirty: boolean;
  isValidating: boolean;
  isInvalid: boolean;
  errors: string[];
}

/**
 * Common props shared across all form field components
 */
export interface BaseFieldProps {
  label?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  showAllErrors?: boolean;
}

/**
 * Field state interface matching TanStack Form's field.state.meta
 */
interface FieldStateMeta {
  isTouched: boolean;
  isBlurred: boolean;
  isDirty: boolean;
  isValidating: boolean;
  errors: unknown[];
}

/**
 * Minimal field interface for extracting metadata
 */
interface FieldLike {
  state: {
    meta: FieldStateMeta;
  };
}

/**
 * Extract field metadata from a FieldApi instance
 */
export function toFieldErrors(
  errors: string[],
  showAll: boolean,
): Array<{ message: string }> {
  return (showAll ? errors : errors.slice(0, 1)).map((message) => ({
    message,
  }));
}

export function getFieldMeta(field: FieldLike): FieldMeta {
  const { state } = field;
  const errors = state.meta.errors
    .map((e: unknown) =>
      typeof e === 'string'
        ? e
        : ((e as { message?: string } | null)?.message ?? String(e)),
    )
    .filter(Boolean) as string[];

  return {
    isTouched: state.meta.isTouched,
    isBlurred: state.meta.isBlurred,
    isDirty: state.meta.isDirty,
    isValidating: state.meta.isValidating,
    isInvalid: errors.length > 0,
    errors,
  };
}

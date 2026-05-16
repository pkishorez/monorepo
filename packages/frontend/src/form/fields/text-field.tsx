'use client';

import * as React from 'react';

import { cn } from '#lib/utils';
import { Input } from '#components/ui/input';
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '#components/ui/field';
import { useFieldContext } from '../context.js';
import { getFieldMeta, toFieldErrors, type BaseFieldProps } from '../types.js';

export interface TextFieldProps extends BaseFieldProps {
  type?: React.HTMLInputTypeAttribute;
  autoComplete?: string;
}

export function TextField({
  label,
  description,
  required,
  disabled,
  placeholder,
  className,
  type = 'text',
  autoComplete,
  showAllErrors = true,
}: TextFieldProps) {
  const field = useFieldContext<string>();
  const meta = getFieldMeta(field);
  const showError = meta.isInvalid && meta.isTouched;

  const inputId = React.useId();
  const descriptionId = React.useId();
  const errorId = React.useId();

  const describedBy =
    [description ? descriptionId : undefined, showError ? errorId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <Field
      data-slot="text-field"
      data-invalid={showError || undefined}
      data-disabled={disabled || undefined}
      className={cn(className)}
    >
      {label && (
        <FieldLabel htmlFor={inputId}>
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </FieldLabel>
      )}
      <Input
        id={inputId}
        type={type}
        value={field.state.value ?? ''}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={showError || undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
      />
      {description && (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      )}
      {showError && (
        <FieldError
          id={errorId}
          errors={toFieldErrors(meta.errors, showAllErrors)}
        />
      )}
    </Field>
  );
}

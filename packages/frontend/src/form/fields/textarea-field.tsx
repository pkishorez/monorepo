'use client';

import * as React from 'react';

import { cn } from '#lib/utils';
import { Textarea } from '#components/ui/textarea';
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '#components/ui/field';
import { useFieldContext } from '../context.js';
import { getFieldMeta, toFieldErrors, type BaseFieldProps } from '../types.js';

export interface TextareaFieldProps extends BaseFieldProps {
  rows?: number;
  maxLength?: number;
}

export function TextareaField({
  label,
  description,
  required,
  disabled,
  placeholder,
  className,
  rows,
  maxLength,
  showAllErrors = true,
}: TextareaFieldProps) {
  const field = useFieldContext<string>();
  const meta = getFieldMeta(field);
  const showError = meta.isInvalid && meta.isTouched;

  const textareaId = React.useId();
  const descriptionId = React.useId();
  const errorId = React.useId();

  const describedBy =
    [description ? descriptionId : undefined, showError ? errorId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <Field
      data-slot="textarea-field"
      data-invalid={showError || undefined}
      data-disabled={disabled || undefined}
      className={cn(className)}
    >
      {label && (
        <FieldLabel htmlFor={textareaId}>
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </FieldLabel>
      )}
      <Textarea
        id={textareaId}
        value={field.state.value ?? ''}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
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

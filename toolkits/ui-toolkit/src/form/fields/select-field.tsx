'use client';

import * as React from 'react';

import { cn } from '#lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '#components/ui/field';
import { useFieldContext } from '../context.js';
import { getFieldMeta, toFieldErrors, type BaseFieldProps } from '../types.js';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps extends BaseFieldProps {
  options: SelectOption[];
  size?: 'sm' | 'default';
}

export function SelectField({
  label,
  description,
  required,
  disabled,
  placeholder,
  className,
  options,
  size,
  showAllErrors = true,
}: SelectFieldProps) {
  const field = useFieldContext<string>();
  const meta = getFieldMeta(field);
  const showError = meta.isInvalid && meta.isTouched;

  const triggerId = React.useId();
  const descriptionId = React.useId();
  const errorId = React.useId();

  const describedBy =
    [description ? descriptionId : undefined, showError ? errorId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <Field
      data-slot="select-field"
      data-invalid={showError || undefined}
      data-disabled={disabled || undefined}
      className={cn(className)}
    >
      {label && (
        <FieldLabel htmlFor={triggerId}>
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </FieldLabel>
      )}
      <Select
        value={field.state.value ?? ''}
        onValueChange={(value) => {
          field.handleChange(value ?? '');
          field.handleBlur();
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id={triggerId}
          size={size}
          aria-invalid={showError || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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

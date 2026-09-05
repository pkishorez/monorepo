'use client';

import * as React from 'react';

import { cn } from '#lib/utils';
import { Switch } from '#components/ui/switch';
import { Field, FieldDescription, FieldError } from '#components/ui/field';
import { Label } from '#components/ui/label';
import { useFieldContext } from '../context.js';
import { getFieldMeta, toFieldErrors, type BaseFieldProps } from '../types.js';

export interface SwitchFieldProps extends Pick<
  BaseFieldProps,
  'label' | 'description' | 'disabled' | 'className' | 'showAllErrors'
> {
  size?: 'sm' | 'default';
}

export function SwitchField({
  label,
  description,
  disabled,
  className,
  size,
  showAllErrors = true,
}: SwitchFieldProps) {
  const field = useFieldContext<boolean>();
  const meta = getFieldMeta(field);
  const showError = meta.isInvalid && meta.isTouched;

  const switchId = React.useId();
  const descriptionId = React.useId();
  const errorId = React.useId();

  const describedBy =
    [description ? descriptionId : undefined, showError ? errorId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <Field
      data-slot="switch-field"
      data-invalid={showError || undefined}
      data-disabled={disabled || undefined}
      orientation="horizontal"
      className={cn(className)}
    >
      <Switch
        id={switchId}
        size={size}
        checked={field.state.value ?? false}
        onCheckedChange={(checked: boolean) => {
          field.handleChange(checked);
          field.handleBlur();
        }}
        disabled={disabled}
        aria-invalid={showError || undefined}
        aria-describedby={describedBy}
      />
      {label && <Label htmlFor={switchId}>{label}</Label>}
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

'use client';

import * as React from 'react';

import { cn } from '#lib/utils';
import { Button } from '#components/ui/button';
import { Calendar } from '#components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#components/ui/popover';
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '#components/ui/field';
import { CalendarIcon } from 'lucide-react';
import { useFieldContext } from '../context.js';
import { getFieldMeta, toFieldErrors, type BaseFieldProps } from '../types.js';

export interface DatePickerFieldProps extends Pick<
  BaseFieldProps,
  | 'label'
  | 'description'
  | 'required'
  | 'disabled'
  | 'placeholder'
  | 'className'
  | 'showAllErrors'
> {
  formatDate?: (date: Date) => string;
}

const defaultFormatDate = (date: Date) =>
  date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

export function DatePickerField({
  label,
  description,
  required,
  disabled,
  placeholder = 'Pick a date',
  className,
  formatDate = defaultFormatDate,
  showAllErrors = true,
}: DatePickerFieldProps) {
  const field = useFieldContext<Date | undefined>();
  const meta = getFieldMeta(field);
  const showError = meta.isInvalid && meta.isTouched;
  const value = field.state.value;

  const [open, setOpen] = React.useState(false);
  const triggerId = React.useId();
  const descriptionId = React.useId();
  const errorId = React.useId();

  const describedBy =
    [description ? descriptionId : undefined, showError ? errorId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <Field
      data-slot="date-picker-field"
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
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={triggerId}
              variant="outline"
              disabled={disabled}
              className={cn(
                'w-full justify-start text-left font-normal',
                !value && 'text-muted-foreground',
              )}
              aria-invalid={showError || undefined}
              aria-describedby={describedBy}
              aria-required={required || undefined}
            />
          }
        >
          <CalendarIcon className="mr-2 size-4" />
          {value ? formatDate(value) : placeholder}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(selected) => {
              field.handleChange(selected);
              field.handleBlur();
              setOpen(false);
            }}
            disabled={disabled}
          />
        </PopoverContent>
      </Popover>
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

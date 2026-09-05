'use client';

import * as React from 'react';

import { Button, type buttonVariants } from '#components/ui/button';
import { useFormContext } from '../context.js';
import type { VariantProps } from 'class-variance-authority';

export interface SubmitButtonProps
  extends
    Omit<React.ComponentProps<typeof Button>, 'type'>,
    VariantProps<typeof buttonVariants> {
  loadingText?: string;
  loadingIndicator?: React.ReactNode;
}

export function SubmitButton({
  children,
  loadingText,
  loadingIndicator,
  disabled,
  ...props
}: SubmitButtonProps) {
  const form = useFormContext();

  return (
    <form.Subscribe
      selector={(state) => ({
        isSubmitting: state.isSubmitting,
        canSubmit: state.canSubmit,
      })}
    >
      {({ isSubmitting, canSubmit }) => (
        <Button
          data-slot="submit-button"
          type="submit"
          disabled={disabled || isSubmitting || !canSubmit}
          {...props}
        >
          {isSubmitting ? (
            <>
              {loadingIndicator}
              {loadingText ?? children}
            </>
          ) : (
            children
          )}
        </Button>
      )}
    </form.Subscribe>
  );
}

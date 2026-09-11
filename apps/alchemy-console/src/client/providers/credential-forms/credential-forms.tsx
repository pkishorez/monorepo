import type { ReactNode } from 'react';
import { Input } from 'kui-toolkit/components/ui/input';
import { CircleAlert } from 'kui-toolkit/lucide';
import { cloudflare } from '../cloudflare/index.ts';
import { aws } from '../aws/index.ts';

export type ProviderKind = 'cloudflare' | 'aws';
export const providerKinds: readonly ProviderKind[] = ['cloudflare', 'aws'];
const forms = { cloudflare, aws };

export type FieldSpec = {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder?: string;
  description?: string;
  validate: (value: string) => string | null;
  aside?: (values: Record<string, string>, disabled: boolean) => ReactNode;
};
export const providerForm = (kind: ProviderKind) => forms[kind];
export const providerLabel = (kind: ProviderKind) => forms[kind].label;
export const formatAccount = (kind: ProviderKind, account: string) =>
  forms[kind].formatAccount(account);

/** The first invalid field, in form order, or null when every value passes. */
export const validateSecret = (
  kind: ProviderKind,
  values: Record<string, string>,
): { field: string; message: string } | null => {
  for (const field of forms[kind].fields as readonly FieldSpec[]) {
    const message = field.validate(values[field.key] ?? '');
    if (message) return { field: field.key, message };
  }
  return null;
};

export const toSecret = (kind: ProviderKind, values: Record<string, string>) =>
  forms[kind].toSecret(values);

export function Field({
  id,
  label,
  error,
  aside,
  description,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  aside?: ReactNode;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {description && !error && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="flex items-start gap-1.5 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

/** The provider's secret fields, rendered from its field specs. */
export function SecretFields({
  kind,
  idPrefix,
  values,
  onChange,
  error,
  disabled,
}: {
  kind: ProviderKind;
  idPrefix: string;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  error: { field: string; message: string } | null;
  disabled: boolean;
}) {
  return (
    <>
      {(forms[kind].fields as readonly FieldSpec[]).map((field) => {
        const id = `${idPrefix}-${field.key}`;
        const invalid = error?.field === field.key;
        return (
          <Field
            key={field.key}
            id={id}
            label={field.label}
            error={invalid ? error.message : undefined}
            description={field.description}
            aside={field.aside?.(values, disabled)}
          >
            <Input
              id={id}
              type={field.type}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              data-1p-ignore
              placeholder={field.placeholder}
              value={values[field.key] ?? ''}
              disabled={disabled}
              onChange={(event) => onChange(field.key, event.target.value)}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? `${id}-error` : undefined}
            />
          </Field>
        );
      })}
    </>
  );
}

import type { ComponentProps, ReactNode } from 'react';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
} from '@kestack/web-platform/components/field';
import { Input } from '@kestack/web-platform/components/input';
import { ExternalLinkIcon } from '@kestack/web-platform/components/lucide';
import {
  RadioGroup,
  RadioGroupItem,
} from '@kestack/web-platform/components/radio-group';
import type {
  CredentialField,
  NewCredential,
  Provider,
} from '../../shared/contracts/credential/index.ts';
import { ACCOUNT_ID_URL, cloudflareTokenUrl } from './token-url.ts';

/*
 * The sheet's fields, each provider's own. Every key field is uncontrolled:
 * the keys are read from the form only when it is sent, so they never sit
 * in the Model.
 */

export const PROVIDER_LABEL: Record<Provider, string> = {
  cloudflare: 'Cloudflare',
  aws: 'AWS',
};

const text = (form: FormData, name: CredentialField) =>
  String(form.get(name) ?? '');

/** What the form says, as the User Space takes it. */
export const inputOf = (provider: Provider, form: FormData): NewCredential =>
  provider === 'cloudflare'
    ? {
        provider,
        name: text(form, 'name'),
        secret: {
          accountId: text(form, 'accountId'),
          apiToken: text(form, 'apiToken'),
        },
      }
    : {
        provider,
        name: text(form, 'name'),
        region: text(form, 'region'),
        secret: {
          accessKeyId: text(form, 'accessKeyId'),
          secretAccessKey: text(form, 'secretAccessKey'),
          ...(text(form, 'sessionToken').trim()
            ? { sessionToken: text(form, 'sessionToken') }
            : {}),
        },
      };

/** Keys are not for password managers, autofill, or spellcheck. */
const keyInput = {
  autoComplete: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
  className: 'font-mono',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
} as const;

/** Which field is to blame, and why: the message under it, or null. */
export type ProblemAt = (field: CredentialField) => string | null;

function TextField({
  name,
  label,
  problemAt,
  description,
  ...input
}: {
  readonly name: CredentialField;
  readonly label: string;
  readonly problemAt: ProblemAt;
  readonly description?: ReactNode;
} & Omit<ComponentProps<'input'>, 'name'>) {
  const id = `add-credential-${name}`;
  const problem = problemAt(name);
  return (
    <Field data-invalid={problem !== null || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        aria-invalid={problem !== null || undefined}
        aria-describedby={problem !== null ? `${id}-error` : undefined}
        {...input}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      {problem !== null && (
        <FieldError id={`${id}-error`}>{problem}</FieldError>
      )}
    </Field>
  );
}

function OutLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <ExternalLinkIcon
        aria-hidden
        className="ml-0.5 inline size-3.5 align-[-2px]"
      />
    </a>
  );
}

export function ProviderChoice({
  value,
  onChoose,
}: {
  readonly value: Provider;
  readonly onChoose: (provider: Provider) => void;
}) {
  return (
    <RadioGroup
      aria-label="Provider"
      value={value}
      onValueChange={(next) => onChoose(next as Provider)}
      className="grid-cols-2"
    >
      {(['cloudflare', 'aws'] as const).map((option) => (
        <FieldLabel key={option} htmlFor={`add-credential-provider-${option}`}>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>{PROVIDER_LABEL[option]}</FieldTitle>
            </FieldContent>
            <RadioGroupItem
              value={option}
              id={`add-credential-provider-${option}`}
            />
          </Field>
        </FieldLabel>
      ))}
    </RadioGroup>
  );
}

export function NameField({
  provider,
  problemAt,
}: {
  readonly provider: Provider;
  readonly problemAt: ProblemAt;
}) {
  return (
    <TextField
      name="name"
      label="Name"
      placeholder={
        provider === 'cloudflare' ? 'Personal account' : 'Production AWS'
      }
      problemAt={problemAt}
      autoComplete="off"
      maxLength={64}
    />
  );
}

export function CloudflareFields({
  accountId,
  onAccountId,
  problemAt,
}: {
  /** As typed so far, for the token link. */
  readonly accountId: string;
  readonly onAccountId: (accountId: string) => void;
  readonly problemAt: ProblemAt;
}) {
  return (
    <>
      <TextField
        name="accountId"
        label="Account ID"
        problemAt={problemAt}
        value={accountId}
        onChange={(event) => onAccountId(event.target.value)}
        {...keyInput}
        description={
          <>
            32 letters and digits, in your dashboard’s address.{' '}
            <OutLink href={ACCOUNT_ID_URL}>Find it</OutLink>
          </>
        }
      />
      <TextField
        name="apiToken"
        label="API token"
        type="password"
        problemAt={problemAt}
        {...keyInput}
        description={
          <>
            <OutLink href={cloudflareTokenUrl(accountId)}>
              Create a token
            </OutLink>{' '}
            with the permissions Alchemy deploys with already filled in.
          </>
        }
      />
    </>
  );
}

export function AwsFields({ problemAt }: { readonly problemAt: ProblemAt }) {
  return (
    <>
      <TextField
        name="accessKeyId"
        label="Access key ID"
        problemAt={problemAt}
        {...keyInput}
      />
      <TextField
        name="secretAccessKey"
        label="Secret access key"
        type="password"
        problemAt={problemAt}
        {...keyInput}
      />
      <TextField
        name="sessionToken"
        label="Session token (optional)"
        type="password"
        problemAt={problemAt}
        {...keyInput}
        description="Only for temporary keys."
      />
      <TextField
        name="region"
        label="Region"
        defaultValue="us-east-1"
        problemAt={problemAt}
        {...keyInput}
        description="Where your stacks deploy, like us-east-1."
      />
    </>
  );
}

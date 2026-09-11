import { Button } from 'kui-toolkit/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from 'kui-toolkit/components/ui/dropdown-menu';
import { ChevronDown, ExternalLink } from 'kui-toolkit/lucide';
import { cloudflareAccountUrl, cloudflareTokenUrl } from './token-url.ts';

const validAccount = (value: string) => /^[a-f0-9]{32}$/i.test(value.trim());

function OpenCloudflare() {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      render={
        <a
          href={cloudflareAccountUrl}
          target="_blank"
          rel="noopener noreferrer"
        />
      }
    >
      Open Cloudflare
      <ExternalLink />
    </Button>
  );
}

function CreateToken({
  accountId,
  disabled,
}: {
  accountId: string;
  disabled: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled || !validAccount(accountId)}
        render={<Button type="button" variant="outline" size="xs" />}
      >
        Create token
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        {(['read', 'write'] as const).map((access) => (
          <DropdownMenuItem
            key={access}
            render={
              <a
                href={cloudflareTokenUrl(accountId, access) ?? ''}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <span className="flex flex-col gap-0.5">
              <span>{access === 'read' ? 'Read' : 'Write'}</span>
              <span className="text-xs text-muted-foreground">
                {access === 'read'
                  ? 'Browse stacks, stages, and resources'
                  : 'Browse and delete stages. Add Hyperdrive by hand if you use it.'}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What the Cloudflare credential form asks for and how it turns answers into a secret. */
export const cloudflare = {
  kind: 'cloudflare' as const,
  label: 'Cloudflare',
  description:
    'An account that hosts Alchemy state, and whose Workers, D1, KV, R2, Queues and DNS Console may delete.',
  namePlaceholder: 'Personal Cloudflare',
  fields: [
    {
      key: 'accountId',
      label: 'Account ID',
      type: 'text' as const,
      placeholder: '32-character account ID',
      description:
        'Pick an account in Cloudflare; the ID is in the page URL and under Account details.',
      validate: (value: string) =>
        validAccount(value)
          ? null
          : 'Enter the 32-character account ID from Cloudflare.',
      aside: () => <OpenCloudflare />,
    },
    {
      key: 'apiToken',
      label: 'API token',
      type: 'password' as const,
      placeholder: 'Paste your API token',
      validate: (value: string) =>
        value.trim() ? null : 'Paste your Cloudflare API token.',
      aside: (values: Record<string, string>, disabled: boolean) => (
        <CreateToken accountId={values.accountId ?? ''} disabled={disabled} />
      ),
    },
  ],
  toSecret: (values: Record<string, string>) => ({
    provider: 'cloudflare' as const,
    accountId: (values.accountId ?? '').trim(),
    apiToken: (values.apiToken ?? '').trim(),
  }),
  formatAccount: (account: string) => `${account.slice(0, 8)}…`,
};

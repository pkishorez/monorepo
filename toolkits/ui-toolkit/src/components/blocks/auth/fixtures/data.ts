import type {
  AccountsView,
  Branding,
  GrantView,
  ScopeDescriptions,
  SessionView,
  SignedInAccount,
  UserView,
} from '../auth-screens';

const DAY = 24 * 60 * 60 * 1000;
export const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);
const daysAhead = (days: number) => new Date(now.getTime() + days * DAY);

export const branding: Branding = {
  appName: 'Northwind',
  logoUrl:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><rect width="36" height="36" rx="8" fill="#0f766e"/><path d="M11 25V11l14 14V11" stroke="white" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ),
};

export const plainBranding: Branding = { appName: 'Northwind' };

export const user: UserView = {
  name: 'Ada Lovelace',
  email: 'ada@northwind.dev',
  image: null,
};

export const sessions: SessionView[] = [
  {
    id: 's-cli',
    userAgent: 'northwind-cli/1.4.2',
    current: false,
    signedInAt: daysAgo(40),
    lastActiveAt: daysAgo(1),
    expiresAt: daysAhead(6),
  },
  {
    id: 's-current',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    current: true,
    signedInAt: daysAgo(3),
    lastActiveAt: now,
    expiresAt: daysAhead(7),
  },
  {
    id: 's-phone',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    current: false,
    signedInAt: daysAgo(380),
    lastActiveAt: daysAgo(12),
    expiresAt: daysAhead(1),
  },
  {
    id: 's-unknown',
    userAgent: null,
    current: false,
    signedInAt: daysAgo(9),
    lastActiveAt: daysAgo(9),
    expiresAt: daysAhead(0),
  },
];

export const scopeDescriptions: ScopeDescriptions = {
  'notes:read': 'Read your notes',
  'notes:write': 'Create and edit your notes',
};

export const grants: GrantView[] = [
  {
    clientId: 'https://claude.ai/oauth/metadata.json',
    name: 'Claude',
    scopes: ['openid', 'email', 'notes:read', 'notes:write'],
    grantedAt: daysAgo(21),
  },
  {
    clientId: 'codex-cli',
    name: 'Codex',
    scopes: ['openid', 'notes:read'],
    grantedAt: daysAgo(2),
  },
];

export const pause = (ms = 900) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const failAfter = async (message: string, ms = 900) => {
  await pause(ms);
  throw new Error(message);
};

export const account = {
  email: user.email,
  onSignOut: () => undefined,
};

export const signedInAccounts: SignedInAccount[] = [
  { id: 'a-ada', name: 'Ada Lovelace', email: 'ada@northwind.dev' },
  { id: 'a-work', name: 'Ada Lovelace', email: 'ada.lovelace@numastays.com' },
  { id: 'a-nameless', name: '', email: 'ops@northwind.dev' },
  {
    id: 'a-charles',
    name: 'Charles Babbage',
    email: 'charles.babbage@analytical-engines.example.org',
  },
  { id: 'a-mary', name: 'Mary Somerville', email: 'mary@northwind.dev' },
];

const noop = () => undefined;

/** Static switcher props: every action waits, nothing changes. */
export const accountsView = (
  count: number,
  overrides: Partial<AccountsView> = {},
): AccountsView => ({
  active: signedInAccounts[0]!,
  others: signedInAccounts.slice(1, count),
  canAdd: count < 5,
  onSwitch: () => pause(),
  onAdd: noop,
  onSignOut: () => pause(),
  onSignOutAll: () => pause(),
  ...overrides,
});

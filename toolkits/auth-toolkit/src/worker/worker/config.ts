import type { BetterAuthOptions } from 'better-auth';

type Awaitable<T> = T | Promise<T>;

/** What the pages show. */
export interface Brand {
  /** The product's name: "Sign in to {name}". */
  name: string;
  /** An image URL; also the favicon. */
  logo?: string | undefined;
  /** One CSS colour for the primary button and the focus ring. */
  accent?: string | undefined;
}

/** Who is about to register, link, or sign in with Google. */
export interface Candidate {
  email: string;
  name: string;
}

/** Each Resource Server's URL, with the Scopes it understands and the words
 * the Consent Screen and Home Page use for each. */
export type OAuthResources = Readonly<
  Record<string, Readonly<Record<string, string>>>
>;

export interface AuthWorkerConfig {
  /** The Auth Worker's own public URL. */
  url: string;
  /** The better-auth secret. Rotating it signs every User out. */
  secret: string;
  google: { clientId: string; clientSecret: string };
  /** The Primary Database: `d1(env.DB)`, or `memory()` in tests. */
  database: BetterAuthOptions['database'];
  /** The Shared Cookie Domain, e.g. `.example.com`. Every origin under it
   * is trusted; no other origin is. */
  cookieDomain: string;
  brand: Brand;
  /** Accounts one browser may hold. @default 5 */
  maxAccounts?: number | undefined;
  /** The User Admission Policy: `false` refuses the identity. */
  admit?: ((user: Candidate) => Awaitable<boolean>) | undefined;
  /** Connects better-auth's hosted dashboard. Blank leaves it off. */
  dashApiKey?: string | undefined;
  /** Turns on the Authorization Server Role. */
  oauth?: { resources: OAuthResources } | undefined;
  /** Shows Kabuki's devtools on the pages. For local development only. */
  dev?: boolean | undefined;
}

export const DEFAULT_MAX_ACCOUNTS = 5;

/** How long the Cookie Cache vouches for a Sign-in without a database read. */
export const COOKIE_CACHE_SECONDS = 300;

/** OpenID's Scopes, always offered, in the words a User reads. */
export const OPENID_SCOPES: Readonly<Record<string, string>> = {
  openid: 'Know who you are',
  profile: 'See your name and picture',
  email: 'See your email address',
  offline_access: 'Stay connected when you are not using it',
};

const fail = (message: string): never => {
  throw new Error(`authWorker: ${message}`);
};

const parseUrl = (value: string, field: string) => {
  try {
    return new URL(value);
  } catch {
    return fail(`${field} must be an absolute URL, got "${value}".`);
  }
};

const isUnder = (hostname: string, domain: string) =>
  hostname === domain || hostname.endsWith(`.${domain}`);

/** The config, checked, with what the worker derives from it. */
export interface Resolved {
  config: AuthWorkerConfig;
  origin: string;
  /** The Shared Cookie Domain without its leading dot. */
  domain: string;
  maxAccounts: number;
  /** Every Scope the Authorization Server Role offers, with its words;
   * undefined when the role is off. */
  scopes: Readonly<Record<string, string>> | undefined;
  resources: string[];
  isTrustedOrigin: (origin: string | null) => boolean;
}

export const resolveConfig = (config: AuthWorkerConfig): Resolved => {
  const url = parseUrl(config.url, 'url');
  if (!config.secret) fail('secret is required.');
  if (!config.brand?.name?.trim()) fail('brand.name is required.');

  const domain = config.cookieDomain?.trim().replace(/^\./, '').toLowerCase();
  if (!domain || domain.includes('/') || domain.includes(':')) {
    fail(`cookieDomain must be a domain such as ".example.com".`);
  }
  if (!isUnder(url.hostname, domain!)) {
    fail(`url's host ${url.hostname} is not under cookieDomain ${domain}.`);
  }

  const maxAccounts = config.maxAccounts ?? DEFAULT_MAX_ACCOUNTS;
  if (!Number.isSafeInteger(maxAccounts) || maxAccounts < 1) {
    fail('maxAccounts must be a positive integer.');
  }

  let scopes: Record<string, string> | undefined;
  const resources = Object.keys(config.oauth?.resources ?? {});
  if (config.oauth) {
    scopes = { ...OPENID_SCOPES };
    for (const resource of resources) {
      parseUrl(resource, `oauth.resources key`);
      for (const [name, description] of Object.entries(
        config.oauth.resources[resource]!,
      )) {
        if (!/^[\x21\x23-\x5b\x5d-\x7e]+$/.test(name)) {
          fail(`"${name}" is not a valid scope name.`);
        }
        if (scopes[name] !== undefined && scopes[name] !== description) {
          fail(`scope "${name}" has two different descriptions.`);
        }
        scopes[name] = description;
      }
    }
  }

  // http only when the worker itself runs on http (local development).
  const protocols = new Set(['https:', url.protocol]);
  const isTrustedOrigin = (origin: string | null) => {
    if (!origin || origin === 'null') return false;
    try {
      const parsed = new URL(origin);
      return (
        parsed.origin === origin &&
        protocols.has(parsed.protocol) &&
        isUnder(parsed.hostname, domain!)
      );
    } catch {
      return false;
    }
  };

  return {
    config,
    origin: url.origin,
    domain: domain!,
    maxAccounts,
    scopes,
    resources,
    isTrustedOrigin,
  };
};

/** better-auth's own form of the same trust rule, for its origin and
 * redirect checks. */
export const trustedOriginPatterns = ({ origin, domain }: Resolved) => {
  const schemes = new Set(['https', new URL(origin).protocol.slice(0, -1)]);
  return [
    origin,
    ...[...schemes].flatMap((scheme) => [
      `${scheme}://${domain}`,
      `${scheme}://*.${domain}`,
    ]),
  ];
};

import { Schema } from 'effect';

/*
 * What the pages hold, as Schemas: what the Auth Worker hands them on every
 * request, and what its `/api/auth` endpoints answer. Every Message that
 * carries one is checked against it.
 */

export const Brand = Schema.Struct({
  name: Schema.String,
  logo: Schema.NullOr(Schema.String),
  accent: Schema.NullOr(Schema.String),
});
export type Brand = typeof Brand.Type;

/** What every page loads on the server: the Auth Worker's pages context. */
export const PagesData = Schema.Struct({
  brand: Brand,
  maxAccounts: Schema.Number,
  /** The Shared Cookie Domain, without its leading dot. */
  cookieDomain: Schema.String,
  /** The Auth Worker's own origin. */
  origin: Schema.String,
  /** Every Scope in words; null with the Authorization Server Role off. */
  scopes: Schema.NullOr(Schema.Record(Schema.String, Schema.String)),
});
export type PagesData = typeof PagesData.Type;

/** What the Auth Worker hands its pages app, as `PagesContext` types it. */
export interface PagesEnv {
  readonly brand: {
    readonly name: string;
    readonly logo?: string | undefined;
    readonly accent?: string | undefined;
  };
  readonly maxAccounts: number;
  readonly cookieDomain: string;
  readonly origin: string;
  readonly oauth?:
    | { readonly scopes: Readonly<Record<string, string>> }
    | undefined;
  /** This browser's data, read in-process by the Loaders: `BrowserReads`. */
  readonly reads: {
    readonly accounts: (request: Request) => Promise<AccountList>;
    readonly signIns: (request: Request) => Promise<ReadonlyArray<SignIn>>;
    readonly grants: (request: Request) => Promise<ReadonlyArray<Grant>>;
    readonly deviceRequest: (userCode: string) => Promise<DeviceRequest>;
    readonly consentRequest: (search: string) => Promise<ConsentRequest>;
  };
}

export const pagesData = (env: PagesEnv): PagesData => ({
  brand: {
    name: env.brand.name,
    logo: env.brand.logo ?? null,
    accent: env.brand.accent ?? null,
  },
  maxAccounts: env.maxAccounts,
  cookieDomain: env.cookieDomain,
  origin: env.origin,
  scopes: env.oauth ? { ...env.oauth.scopes } : null,
});

export const Account = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
  image: Schema.NullOr(Schema.String),
});
export type Account = typeof Account.Type;

export const SignIn = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: Schema.Literals(['browser', 'device', 'unknown']),
  current: Schema.Boolean,
  createdAt: Schema.String,
  lastActiveAt: Schema.String,
  expiresAt: Schema.String,
});
export type SignIn = typeof SignIn.Type;

export const Scope = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
});
export type Scope = typeof Scope.Type;

export const Client = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  icon: Schema.NullOr(Schema.String),
  uri: Schema.NullOr(Schema.String),
});
export type Client = typeof Client.Type;

export const Grant = Schema.Struct({
  id: Schema.String,
  client: Client,
  scopes: Schema.Array(Scope),
  grantedAt: Schema.String,
});
export type Grant = typeof Grant.Type;

export interface AccountList {
  readonly active: string | null;
  readonly accounts: ReadonlyArray<Account>;
}

export interface DeviceRequest {
  readonly userCode: string;
  readonly status: string;
  readonly app: string | null;
}

export interface ConsentRequest {
  readonly client: Client;
  readonly scopes: ReadonlyArray<Scope>;
}

/** This browser's Accounts, as the page was drawn with them. */
export const Accounts = Schema.Struct({
  /** The Active Account, if it is one of `list`. */
  active: Schema.NullOr(Schema.String),
  list: Schema.Array(Account),
});
export type Accounts = typeof Accounts.Type;

/** What every page loads: the pages context, and this browser's Accounts. */
export const PageData = Schema.Struct({
  ...PagesData.fields,
  accounts: Accounts,
});
export type PageData = typeof PageData.Type;

/** The Home Page's: the Active Account's Sign-ins and Grants too. */
export const HomeData = Schema.Struct({
  ...PageData.fields,
  signIns: Schema.Array(SignIn),
  grants: Schema.Array(Grant),
});
export type HomeData = typeof HomeData.Type;

/** The Login Screen's: the app a sign-in continues to, if it names one. */
export const LoginData = Schema.Struct({
  ...PageData.fields,
  continuing: Schema.NullOr(Schema.String),
});
export type LoginData = typeof LoginData.Type;

/** A Device Login code as the link or the visitor gave it: found, or why not. */
export const DeviceLookup = Schema.TaggedUnion({
  Found: {
    userCode: Schema.String,
    status: Schema.String,
    app: Schema.NullOr(Schema.String),
  },
  Failed: { code: Schema.String, message: Schema.String },
});
export type DeviceLookup = typeof DeviceLookup.Type;

/** The Device Screen's: its code looked up, or null with none given. */
export const DeviceData = Schema.Struct({
  ...PageData.fields,
  lookup: Schema.NullOr(DeviceLookup),
});
export type DeviceData = typeof DeviceData.Type;

/** An OAuth Client's request, from the page's signed query, or why it can't be answered. */
export const ConsentLookup = Schema.TaggedUnion({
  Found: {
    client: Client,
    scopes: Schema.Array(Scope),
    /** The page's whole query, without `?`, which the answer sends back signed. */
    query: Schema.String,
  },
  Invalid: { message: Schema.String },
});
export type ConsentLookup = typeof ConsentLookup.Type;

/** The Consent Screen's. */
export const ConsentData = Schema.Struct({
  ...PageData.fields,
  request: ConsentLookup,
});
export type ConsentData = typeof ConsentData.Type;

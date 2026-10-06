/** What the phone gives the expo target: secret storage, the system sign-in
 * sheet, and the system browser. `native-device.ts` builds it from Expo's
 * modules; tests hand in fakes. */
export interface Device {
  readonly secrets: {
    readonly get: (key: string) => Promise<string | null>;
    readonly set: (key: string, value: string) => Promise<void>;
    readonly remove: (key: string) => Promise<void>;
  };
  /** Runs one authorization in the system sign-in sheet, with PKCE and a
   * checked `state`, and says how it came back. */
  readonly authorize: (request: AuthorizeRequest) => Promise<Authorized>;
  /** Opens a page in the system browser, which shares the sheet's cookies. */
  readonly open: (url: string) => Promise<void>;
}

export interface AuthorizeRequest {
  readonly authorizationEndpoint: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: ReadonlyArray<string>;
  readonly params: Readonly<Record<string, string>>;
}

export type Authorized =
  | {
      readonly type: 'code';
      readonly code: string;
      readonly codeVerifier: string;
    }
  | { readonly type: 'cancelled' }
  | {
      readonly type: 'error';
      readonly code: string;
      readonly description?: string | undefined;
    };

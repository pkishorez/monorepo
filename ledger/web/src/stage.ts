/** The shared sign-in service, for this stage. */
export const AUTH_URL = import.meta.env.DEV
  ? 'https://auth.kishore.computer'
  : 'https://auth.kishore.app';

/**
 * Ledger's audience at the sign-in service: native Ledger's Access Tokens
 * are minted for it alone, so a token for anything else (an MCP Server, say)
 * is refused by the cloud Backend.
 */
export const LEDGER_RESOURCE = import.meta.env.DEV
  ? 'https://kstack.kishore.computer/rpc'
  : 'https://kstack.kishore.app/rpc';

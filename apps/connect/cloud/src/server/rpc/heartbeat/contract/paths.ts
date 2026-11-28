export const AUTH_PATH = '/auth';

export const HEARTBEAT_PATH = '/heartbeat';

export const RELEASE_PATH = '/releases';

export const VERSION_HEADER = 'ke-connect-version';

export const UPGRADE_REQUIRED = 426;

export const releaseKey = (name: string, hash: string) => `${name}/${hash}.mjs`;

import { describe, expect, it } from 'vitest';
import { inputProblem } from './index.ts';

const cloudflare = (apiToken: string) => ({
  provider: 'cloudflare' as const,
  name: 'Sandbox',
  secret: { accountId: 'd81fbf7c729395fbe59316b1e4b09493', apiToken },
});

describe('inputProblem', () => {
  it('passes a well-formed Cloudflare credential', () => {
    expect(inputProblem(cloudflare('abc-DEF_123'))).toBeNull();
  });

  it('refuses a token with a character no key holds, before any header is built', () => {
    for (const token of ['abc​def', '“abc”', 'abc def'])
      expect(inputProblem(cloudflare(token))?.field).toBe('apiToken');
  });

  it('refuses an AWS session token with a pasted zero-width space', () => {
    expect(
      inputProblem({
        provider: 'aws',
        name: 'Prod',
        region: 'cn-north-1',
        secret: {
          accessKeyId: 'AKIAGOODKEY000000',
          secretAccessKey: 'shh',
          sessionToken: 'tok​',
        },
      })?.field,
    ).toBe('sessionToken');
  });
});

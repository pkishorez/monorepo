import { describe, expect, it } from 'vitest';
import { acceptsModel } from './models.js';

describe('acceptsModel', () => {
  it.each([
    'gpt-6-sol',
    'gpt-6-luna',
    'gpt-6-astra',
    'gpt-6.1-sol',
    'gpt-5.6',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5',
    'gpt-5.4-mini',
    'gpt-5.3-codex',
    'gpt-5.3-codex-spark',
    'gpt-5',
  ])('accepts %s', (id) => expect(acceptsModel(id)).toBe(true));

  it.each([
    'gpt-5.5-pro',
    'gpt-5-pro',
    'gpt-image-1',
    'gpt-image-2',
    'chatgpt-image-latest',
    'gpt-realtime-2.1',
    'text-embedding-3-large',
    'o3',
    'o4-mini',
    'gpt-4.1',
    'gpt-4o',
    'gpt-3.5-turbo',
    'gpt-daybreak-blue-latest',
  ])('rejects %s', (id) => expect(acceptsModel(id)).toBe(false));
});

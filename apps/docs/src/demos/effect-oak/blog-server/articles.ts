export const FLAKY_POST_ID = 'flaky-connection';

export const ARTICLES = [
  {
    id: 'model-is-the-cache',
    title: 'The Model Is the Cache',
    excerpt: 'Why a single source of truth needs no query client.',
    author: 'Maya Okafor',
    body: 'A cache is a place where fetched data lives between requests. In The Elm Architecture that place already exists: the Model. Store each query as a small state machine and every view reads the same truth.',
  },
  {
    id: 'stale-while-revalidate',
    title: 'Stale-While-Revalidate, Explained',
    excerpt: 'Show the old data while the new data loads.',
    author: 'Theo Lindqvist',
    body: 'Dropping back to a spinner throws away perfectly good data. A Refreshing state carries the previous value while the fetch runs, so the screen never goes blank.',
  },
  {
    id: 'query-keys-are-names',
    title: 'Query Keys Are Just Names',
    excerpt: 'A Model field per query replaces stringly-typed keys.',
    author: 'Priya Raman',
    body: 'When queries are known statically, the field name is the key. Reach for a map keyed by a domain identifier only when the entries are genuinely dynamic, like these post details.',
  },
  {
    id: 'invalidation-is-a-message',
    title: 'Invalidation Is a Message',
    excerpt: 'Marking data stale is a fact, not a framework feature.',
    author: 'Jonas Weber',
    body: 'Invalidation means the cached value can no longer be trusted. Send a Message, move the entry to Refreshing, and return the fetch Command. The whole policy is visible in Update.',
  },
  {
    id: FLAKY_POST_ID,
    title: 'This Post Fails Every Other Fetch',
    excerpt: 'Open it to see the Failed state, then retry.',
    author: 'Flaky McNetwork',
    body: 'You made it. The fake server failed your first attempt on purpose and succeeded on the retry, which is exactly the round trip a Failed state plus a retry Message is for.',
  },
] as const;

import { isTestEmail } from '../../api/index.ts';

/** "Test" beside a Test User's name; nothing beside anyone else's. */
export function TestLabel({ email }: { email: string }) {
  return isTestEmail(email) ? (
    <span className="shrink-0 rounded-sm bg-warning-soft px-1.5 text-xs leading-5 font-medium text-warning">
      Test
    </span>
  ) : null;
}

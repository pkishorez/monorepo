import { AgentLogo } from './logo.tsx';
import { accountName, type Named } from './name.ts';

/** A Harness Account where it runs: its agent's logo, then its own name unless it is the Default Account. */
export function AccountLabel({
  named,
  className,
}: {
  readonly named: Named;
  readonly className?: string;
}) {
  const rest = accountName(named);
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1 ${className ?? ''}`}
    >
      <AgentLogo agent={named.agent} />
      {rest !== null && <span className="min-w-0 truncate">{rest}</span>}
    </span>
  );
}

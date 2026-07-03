import { useMemo, useState } from 'react';

import { ChevronRightIcon } from 'lucide-react';

import { cn } from '#lib/utils';

import { JsonTree } from './json-tree';

/**
 * Attribute keys carrying these prefixes describe the emitting
 * resource/instrumentation scope rather than the operation itself. They are
 * verbose and identical across most spans, so we hide them behind an
 * expand-on-demand disclosure and let user-defined attributes take precedence.
 */
const SYSTEM_PREFIXES = ['resource.', 'scope.'] as const;

function isSystemKey(key: string): boolean {
  return SYSTEM_PREFIXES.some((prefix) => key.startsWith(prefix));
}

interface AttributeSectionProps {
  attributes: Record<string, unknown>;
  size?: 'compact' | 'roomy';
}

export function AttributeSection({ attributes, size }: AttributeSectionProps) {
  const [showSystem, setShowSystem] = useState(false);

  const { userAttrs, systemAttrs, systemCount } = useMemo(() => {
    const user: Record<string, unknown> = {};
    const system: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (isSystemKey(key)) system[key] = value;
      else user[key] = value;
    }
    return {
      userAttrs: user,
      systemAttrs: system,
      systemCount: Object.keys(system).length,
    };
  }, [attributes]);

  const hasUser = Object.keys(userAttrs).length > 0;

  if (!hasUser && systemCount === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {hasUser ? (
        <JsonTree value={userAttrs} size={size} />
      ) : (
        <p className="text-xs text-muted-foreground">
          No user-defined attributes.
        </p>
      )}

      {systemCount > 0 && (
        <div className="flex flex-col gap-2 border-t border-border/40 pt-2">
          <button
            type="button"
            onClick={() => setShowSystem((prev) => !prev)}
            className="flex items-center gap-1.5 self-start text-[11px] font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRightIcon
              className={cn(
                'size-3 transition-transform',
                showSystem && 'rotate-90',
              )}
            />
            Resource &amp; scope
            <span className="tabular-nums text-muted-foreground/70">
              {systemCount}
            </span>
          </button>
          {showSystem && <JsonTree value={systemAttrs} size={size} />}
        </div>
      )}
    </div>
  );
}

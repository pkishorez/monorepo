import type { IndexEntry } from "../types";
import { extractKeys, hasVariable, scrollbarStyles } from "../utils";
import { KeyBadge } from "./key-badge";

interface IndexTableProps {
  entries: IndexEntry[];
  onKeyHover: (key: string | null) => void;
}

export function IndexTable({ entries, onKeyHover }: IndexTableProps) {
  const filtered = entries.filter(
    ({ index }) => hasVariable(index.pk.pattern) || hasVariable(index.sk.pattern),
  );

  if (filtered.length === 0) return null;

  return (
    <div className="text-xs mb-4">
      <div className="text-neutral-500 uppercase tracking-wide text-[10px] mb-1.5">
        Indexes
      </div>
      <div className={`overflow-x-auto pb-1 ${scrollbarStyles}`}>
        <div className="space-y-1">
          {filtered.map(({ label, index }) => {
            const pkKeys = extractKeys(index.pk.pattern);
            const skKeys = extractKeys(index.sk.pattern);
            return (
              <div key={label} className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-neutral-500 text-[10px] w-16 shrink-0">{label}</span>
                <div className="flex items-center gap-1">
                  {pkKeys.map((key) => (
                    <KeyBadge key={`pk-${key}`} name={key} variant="pk" onHover={onKeyHover} />
                  ))}
                  {pkKeys.length > 0 && skKeys.length > 0 && (
                    <span className="text-neutral-600 text-[10px]">→</span>
                  )}
                  {skKeys.map((key) => (
                    <KeyBadge key={`sk-${key}`} name={key} variant="sk" onHover={onKeyHover} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

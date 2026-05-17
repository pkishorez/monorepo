interface AttributeSectionProps {
  attributes: Record<string, unknown>;
}

export function AttributeSection({ attributes }: AttributeSectionProps) {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[40%_1fr] gap-2 text-xs">
          <span
            className="truncate font-mono text-muted-foreground"
            title={key}
          >
            {key}
          </span>
          <span className="min-w-0 break-all font-mono text-foreground">
            {typeof value === 'string' ? value : JSON.stringify(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

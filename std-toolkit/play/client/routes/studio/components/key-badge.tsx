interface KeyBadgeProps {
  name: string;
  variant: "pk" | "sk";
  onHover: (key: string | null) => void;
}

const variantStyles = {
  pk: "bg-emerald-500/15 text-emerald-400",
  sk: "bg-amber-500/15 text-amber-400",
} as const;

export function KeyBadge({ name, variant, onHover }: KeyBadgeProps) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${variantStyles[variant]}`}
      onMouseEnter={() => onHover(name)}
      onMouseLeave={() => onHover(null)}
    >
      {name}
    </span>
  );
}

interface EntityReferenceProps {
  entityName: string;
  isHighlighted?: boolean | undefined;
}

export function EntityReference({ entityName, isHighlighted }: EntityReferenceProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${isHighlighted ? "font-semibold" : ""}`}
      title={`References ${entityName} entity`}
    >
      <span className="text-pink-400">{entityName}</span>
      <svg
        className="w-3 h-3 text-pink-400/60"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
        />
      </svg>
    </span>
  );
}

interface EntityIdentifierProps {
  entityName: string;
  isHighlighted?: boolean | undefined;
}

export function EntityIdentifier({ entityName, isHighlighted }: EntityIdentifierProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${isHighlighted ? "font-semibold" : ""}`}
      title={`Identifier for ${entityName} entity`}
    >
      <span className="text-pink-400">string</span>
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
          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
        />
      </svg>
    </span>
  );
}

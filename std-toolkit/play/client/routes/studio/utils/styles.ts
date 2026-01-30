export const scrollbarStyles = `
  [&::-webkit-scrollbar]:h-1.5
  [&::-webkit-scrollbar-track]:bg-neutral-800
  [&::-webkit-scrollbar-track]:rounded
  [&::-webkit-scrollbar-thumb]:bg-neutral-600
  [&::-webkit-scrollbar-thumb]:rounded
  [&::-webkit-scrollbar-thumb:hover]:bg-neutral-500
`;

export const typeColors = {
  string: "text-emerald-400",
  number: "text-blue-400",
  integer: "text-blue-400",
  boolean: "text-amber-400",
  enum: "text-purple-400",
  array: "text-cyan-400",
  object: "text-orange-400",
  unknown: "text-neutral-400",
  reference: "text-pink-400",
} as const;

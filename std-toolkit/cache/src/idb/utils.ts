export type PartitionKey = Record<string, string>;

export function serializePartition(partition?: PartitionKey): string {
  if (!partition || Object.keys(partition).length === 0) {
    return "";
  }
  return Object.keys(partition)
    .sort()
    .map((key) => `${key}:${partition[key]}`)
    .join("#");
}

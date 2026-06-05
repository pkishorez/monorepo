import { JsonTree } from './json-tree';

interface AttributeSectionProps {
  attributes: Record<string, unknown>;
  size?: 'compact' | 'roomy';
}

export function AttributeSection({ attributes, size }: AttributeSectionProps) {
  if (Object.keys(attributes).length === 0) return null;
  return <JsonTree value={attributes} size={size} />;
}

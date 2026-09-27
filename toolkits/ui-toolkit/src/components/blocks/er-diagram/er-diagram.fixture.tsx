import { ERDiagram } from './er-diagram';
import {
  allDataTypesSnapshot,
  arrayPlaylistSnapshot,
  complexCommerceSnapshot,
  cyclicTeamsSnapshot,
  emptySnapshot,
  externalAuditSnapshot,
  optionalBlogSnapshot,
  selfReferenceSnapshot,
  singleSettingsSnapshot,
  simpleOrdersSnapshot,
  versionedAccountsSnapshot,
} from './fixtures/snapshots';

function Frame({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-muted/20 p-6">{children}</div>
  );
}

export default {
  'single entity': (
    <Frame>
      <ERDiagram className="h-full" snapshot={singleSettingsSnapshot} />
    </Frame>
  ),
  'simple orders': (
    <Frame>
      <ERDiagram className="h-full" snapshot={simpleOrdersSnapshot} />
    </Frame>
  ),
  'schema versions (latest)': (
    <Frame>
      <ERDiagram className="h-full" snapshot={versionedAccountsSnapshot} />
    </Frame>
  ),
  'all schema data types': (
    <Frame>
      <ERDiagram className="h-full" snapshot={allDataTypesSnapshot} />
    </Frame>
  ),
  'mutual cycle': (
    <Frame>
      <ERDiagram className="h-full" snapshot={cyclicTeamsSnapshot} />
    </Frame>
  ),
  'optional reference': (
    <Frame>
      <ERDiagram className="h-full" snapshot={optionalBlogSnapshot} />
    </Frame>
  ),
  'array reference': (
    <Frame>
      <ERDiagram className="h-full" snapshot={arrayPlaylistSnapshot} />
    </Frame>
  ),
  'external nested reference': (
    <Frame>
      <ERDiagram className="h-full" snapshot={externalAuditSnapshot} />
    </Frame>
  ),
  'self reference': (
    <Frame>
      <ERDiagram className="h-full" snapshot={selfReferenceSnapshot} />
    </Frame>
  ),
  'complex commerce table': (
    <Frame>
      <ERDiagram className="h-full" snapshot={complexCommerceSnapshot} />
    </Frame>
  ),
  empty: (
    <Frame>
      <ERDiagram className="h-full" snapshot={emptySnapshot} />
    </Frame>
  ),
};

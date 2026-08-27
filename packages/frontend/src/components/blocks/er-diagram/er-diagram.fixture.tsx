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
  return <div className="min-h-screen bg-muted/20 p-6">{children}</div>;
}

export default {
  'single entity': (
    <Frame>
      <ERDiagram snapshot={singleSettingsSnapshot} />
    </Frame>
  ),
  'simple orders': (
    <Frame>
      <ERDiagram snapshot={simpleOrdersSnapshot} />
    </Frame>
  ),
  'schema versions (latest)': (
    <Frame>
      <ERDiagram snapshot={versionedAccountsSnapshot} />
    </Frame>
  ),
  'all schema data types': (
    <Frame>
      <ERDiagram className="h-[760px]" snapshot={allDataTypesSnapshot} />
    </Frame>
  ),
  'mutual cycle': (
    <Frame>
      <ERDiagram snapshot={cyclicTeamsSnapshot} />
    </Frame>
  ),
  'optional reference': (
    <Frame>
      <ERDiagram snapshot={optionalBlogSnapshot} />
    </Frame>
  ),
  'array reference': (
    <Frame>
      <ERDiagram snapshot={arrayPlaylistSnapshot} />
    </Frame>
  ),
  'external nested reference': (
    <Frame>
      <ERDiagram snapshot={externalAuditSnapshot} />
    </Frame>
  ),
  'self reference': (
    <Frame>
      <ERDiagram snapshot={selfReferenceSnapshot} />
    </Frame>
  ),
  'complex commerce table': (
    <Frame>
      <ERDiagram className="h-[760px]" snapshot={complexCommerceSnapshot} />
    </Frame>
  ),
  empty: (
    <Frame>
      <ERDiagram className="h-[360px]" snapshot={emptySnapshot} />
    </Frame>
  ),
};

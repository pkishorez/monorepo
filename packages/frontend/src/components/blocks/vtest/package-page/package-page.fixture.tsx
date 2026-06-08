import { overview, sections } from '../fixtures';
import { VtestPackagePage } from './package-page';

export default {
  default: (
    <div className="mx-auto max-w-2xl p-8">
      <VtestPackagePage
        packageName="@monorepo/vtest"
        sections={sections}
        overview={overview}
        onOpenFolder={() => {}}
      />
    </div>
  ),
  'no-overview': (
    <div className="mx-auto max-w-2xl p-8">
      <VtestPackagePage
        packageName="@monorepo/vtest"
        sections={sections}
        onOpenFolder={() => {}}
      />
    </div>
  ),
  empty: (
    <div className="mx-auto max-w-2xl p-8">
      <VtestPackagePage
        packageName="@monorepo/vtest"
        sections={[]}
        onOpenFolder={() => {}}
        onAddFolder={() => {}}
      />
    </div>
  ),
};

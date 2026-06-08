import { discovery, packages } from '../fixtures';
import { VtestPackageList } from './package-list';

export default {
  default: (
    <div className="mx-auto max-w-2xl p-8">
      <VtestPackageList
        packages={packages}
        discovery={discovery}
        onOpenPackage={() => {}}
        onAddPackage={() => {}}
      />
    </div>
  ),
  empty: (
    <div className="mx-auto max-w-2xl p-8">
      <VtestPackageList
        packages={[]}
        discovery={discovery}
        onOpenPackage={() => {}}
        onAddPackage={() => {}}
      />
    </div>
  ),
};

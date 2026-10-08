import { Effect } from 'effect';

import { FileList } from '../file-list';
import { loadFixtureFileContent, loadFixtureFileList } from './fixture-files';

export default {
  Orders: (
    <div className="flex h-svh border-l border-border">
      <FileList
        modulePath="src/domain/orders"
        loadFileList={loadFixtureFileList}
        loadFileContent={loadFixtureFileContent}
        changedPaths={new Map([['src/domain/orders/order.ts', 'modified']])}
        onClose={() => {}}
      />
    </div>
  ),
  'Cannot list': (
    <div className="flex h-svh border-l border-border">
      <FileList
        modulePath="src/domain/orders"
        loadFileList={() => Effect.fail(new Error('git is not installed'))}
        loadFileContent={loadFixtureFileContent}
        onClose={() => {}}
      />
    </div>
  ),
};

import { useState } from 'react';

import { FileList } from '../../file-list';
import {
  loadFixtureFileContent,
  loadFixtureFileList,
} from '../../file-list/fixtures/fixture-files';
import { Laymo } from '../laymo';
import { shopAnalysis } from './shop-analysis';
import { studioAnalysis, studioChanges } from './studio-analysis';

function Explorable({
  analysis,
  changes,
}: {
  readonly analysis: typeof studioAnalysis;
  readonly changes?: typeof studioChanges;
}) {
  const [filesFor, setFilesFor] = useState<string>();
  return (
    <Laymo
      analysis={analysis}
      changes={changes}
      onOpenFiles={setFilesFor}
      panel={
        filesFor === undefined
          ? undefined
          : {
              label: `File list of ${filesFor}`,
              content: (
                <FileList
                  key={filesFor}
                  modulePath={filesFor}
                  loadFileList={loadFixtureFileList}
                  loadFileContent={loadFixtureFileContent}
                  onClose={() => setFilesFor(undefined)}
                />
              ),
              onClose: () => setFilesFor(undefined),
            }
      }
      className="h-svh"
    />
  );
}

export default {
  Studio: <Explorable analysis={studioAnalysis} />,
  'Studio with changes': (
    <Explorable analysis={studioAnalysis} changes={studioChanges} />
  ),
  Shop: <Explorable analysis={shopAnalysis} />,
};

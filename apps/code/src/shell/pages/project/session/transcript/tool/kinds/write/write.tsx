import { FilePlus2Icon } from '@kestack/web-platform/ui/components/lucide';
import { changesOf, relative } from '../../call/index.ts';
import { Clamped } from '../../../fold/index.ts';
import {
  Block,
  json,
  type Kind,
  Labelled,
  Output,
} from '../../output/index.ts';

/**
 * Files written whole: opened, what was written to each, under its path.
 * Claude writes one file, its `content`; Codex any number, its `changes`.
 * Any other shape shows its input as given, and what the tool said.
 */
export const write: Kind = {
  icon: FilePlus2Icon,
  Detail: ({ row, opening, folder }) => {
    const input = row.call.input as { content?: unknown; file_path?: unknown };
    const changes = changesOf(row.call);
    const files =
      changes.length > 0
        ? changes.map(({ path, diff }) => ({ path, text: diff }))
        : typeof input?.content === 'string'
          ? [{ path: String(input.file_path ?? ''), text: input.content }]
          : [];
    if (files.length === 0)
      return (
        <>
          <Labelled label={row.call.name}>
            <Block>
              <Clamped
                id={`${row.id}:input`}
                opening={opening}
                text={json(row.call.input)}
              />
            </Block>
          </Labelled>
          <Output row={row} opening={opening} />
        </>
      );
    return (
      <>
        {files.map(({ path, text }) => (
          <Labelled key={path} label={relative(path, folder)}>
            <Block>
              <Clamped id={`${row.id}:${path}`} opening={opening} text={text} />
            </Block>
          </Labelled>
        ))}
        {row.result?.isError && <Output row={row} opening={opening} />}
      </>
    );
  },
};

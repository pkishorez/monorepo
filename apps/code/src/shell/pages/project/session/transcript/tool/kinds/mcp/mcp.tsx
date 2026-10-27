import { PlugIcon } from '@kestack/web-platform/ui/components/lucide';
import { Clamped } from '../../../fold/index.ts';
import {
  Block,
  json,
  type Kind,
  Labelled,
  Output,
} from '../../output/index.ts';

/** `mcp__linear__save_comment` as its server and its tool. */
const named = (name: string) => {
  const [, server, ...tool] = name.split('__');
  return server && tool.length > 0 ? `${server} · ${tool.join('__')}` : name;
};

/** A tool of a connected server: opened, what it was asked and what it answered. */
export const mcp: Kind = {
  icon: PlugIcon,
  Detail: ({ row, opening }) => (
    <>
      <Labelled label={named(row.call.name)}>
        <Block>
          <Clamped
            id={`${row.id}:input`}
            opening={opening}
            text={json(row.call.input)}
          />
        </Block>
      </Labelled>
      <Output row={row} opening={opening} label="Its answer" />
    </>
  ),
};

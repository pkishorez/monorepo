import { WrenchIcon } from '@kestack/web-platform/ui/components/lucide';
import { Clamped } from '../../../fold/index.ts';
import {
  Block,
  json,
  type Kind,
  Labelled,
  Output,
} from '../../output/index.ts';

/** Any tool not modelled yet: opened, its input as given and its output. */
export const other: Kind = {
  icon: WrenchIcon,
  Detail: ({ row, opening }) => (
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
  ),
};

import type {
  BlueprintNode,
  Look,
  Looked,
} from '../../../rpc/session/contract/index.ts';
import { type Named, namesOf, treeOf } from './names.ts';
import { named } from './signature.ts';
import { trimmed } from './trim.ts';

const every = <A extends { readonly children: ReadonlyArray<A> }>(
  node: A,
): ReadonlyArray<A> => [node, ...node.children.flatMap(every)];

const messagesOf = (node: BlueprintNode) => [
  ...node.top.messages,
  ...Object.values(node.states).flatMap(({ messages }) => messages),
];

const describes = (blueprint: BlueprintNode) =>
  every(blueprint).some((node) =>
    messagesOf(node).some(({ description }) => description !== undefined),
  );

const takes = (
  node: BlueprintNode | undefined,
  state: string,
  described: boolean,
) => {
  if (node === undefined) return [];
  const all = [...node.top.messages, ...(node.states[state]?.messages ?? [])];
  const shown = described
    ? all.filter(({ description }) => description !== undefined)
    : all;
  const internal = all.length - shown.length;
  return [
    ...shown.map(({ tag, payload, description }) =>
      named({
        name: tag,
        shape: payload,
        ...(description === undefined ? {} : { description }),
      }),
    ),
    ...(internal === 0 ? [] : [`+${internal} internal`]),
  ];
};

const dataOf = (state: unknown) => {
  if (state === null || typeof state !== 'object') return undefined;
  const { _tag, ...data } = state as Readonly<Record<string, unknown>>;
  return Object.keys(data).length === 0 ? undefined : trimmed(data);
};

const nameFor = (names: ReadonlyArray<Named>) => {
  const byAddress = new Map(
    names.map(({ node, name }) => [node.address, name]),
  );
  return (address: string) => byAddress.get(address) ?? address;
};

export const lookOf = (look: Look, blueprint: BlueprintNode | null) => {
  const names = namesOf(look.root);
  const nameOf = nameFor(names);
  const instances = new Map<string, Looked>(
    every(look.root).map((node) => [node.address, node]),
  );
  const described = blueprint !== null && describes(blueprint);
  const places = new Map(
    blueprint === null
      ? []
      : every(blueprint).map((node) => [node.place, node]),
  );
  return {
    at: look.at,
    instances: treeOf(names),
    ...(Object.keys(look.opened).length === 0
      ? {}
      : {
          opened: Object.fromEntries(
            Object.entries(look.opened).map(([address, opened]) => {
              const instance = instances.get(address);
              const running = opened.workers
                .filter(({ status }) => status === 'running')
                .map(({ name, key }) => (key === '' ? name : `${name} ${key}`));
              const data = dataOf(opened.state);
              const place =
                instance === undefined ? undefined : places.get(instance.place);
              return [
                nameOf(address),
                {
                  ...(place?.description === undefined
                    ? {}
                    : { about: place.description }),
                  ...(data === undefined ? {} : { data }),
                  model: trimmed(opened.model),
                  ...(opened.props === undefined
                    ? {}
                    : { props: trimmed(opened.props) }),
                  ...(running.length === 0 ? {} : { workers: running }),
                  takes:
                    instance === undefined
                      ? []
                      : takes(place, instance.state, described),
                },
              ];
            }),
          ),
        }),
  };
};

export const namesFor = (root: Looked) => nameFor(namesOf(root));

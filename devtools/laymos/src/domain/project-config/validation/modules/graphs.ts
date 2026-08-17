import type { Config, ConfigValidationIssue } from '../../project-config.js';
import type { ResolvedConfig } from '../../resolve.js';

export function findModuleGraphIssues(
  config: Config,
  resolved: ResolvedConfig,
): readonly ConfigValidationIssue[] {
  return [
    ...findDuplicateIds(config),
    ...Object.entries(resolved.graphs).flatMap(([id, graph]) => {
      const members = Object.keys(graph.members).sort();
      return [
        ...findSurfaceIssues(id, graph, resolved),
        ...findRuleReferenceIssues(id, graph, new Set(members)),
        ...findRuleCycles(id, graph),
      ];
    }),
  ];
}

function findDuplicateIds(config: Config): readonly ConfigValidationIssue[] {
  const owners = new Map<string, string[]>();
  for (const [layer, definition] of Object.entries(config.layers)) {
    for (const id of Object.keys(definition.moduleGraphs)) {
      owners.set(id, [...(owners.get(id) ?? []), layer]);
    }
  }
  return [...owners]
    .filter(([, layers]) => layers.length > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, layers]) => ({
      kind: 'module-graph' as const,
      message: `Module Graph id ${id} is declared in more than one Layer: ${layers.sort().join(', ')}`,
    }));
}

function findSurfaceIssues(
  id: string,
  graph: ResolvedConfig['graphs'][string],
  resolved: ResolvedConfig,
): readonly ConfigValidationIssue[] {
  const definitions = Object.entries(graph.members).map(
    ([member, path]) => [member, resolved.modules[path]!] as const,
  );
  const issues: ConfigValidationIssue[] = definitions
    .filter(([, definition]) => definition.shared)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([member]) => ({
      kind: 'module-graph' as const,
      message: `Module Graph ${id} member ${member} cannot be Shared. Sharing is Layer-wide, so declare it outside the Graph instead.`,
    }));
  if (!definitions.some(([, definition]) => definition.exposed)) {
    issues.push({
      kind: 'module-graph',
      message: `Module Graph ${id} must expose at least one member`,
    });
  }
  return issues;
}

function findRuleReferenceIssues(
  id: string,
  graph: ResolvedConfig['graphs'][string],
  members: ReadonlySet<string>,
): readonly ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];
  for (const [from, destinations] of Object.entries(graph.rules)) {
    if (!members.has(from)) {
      issues.push({
        kind: 'reference',
        message: `Module Graph ${id} rules reference unknown member ${from}`,
      });
    }
    for (const to of destinations) {
      if (members.has(to) && to !== from) continue;
      issues.push({
        kind: to === from ? 'cycle' : 'reference',
        message:
          to === from
            ? `Module Graph ${id} rule cycle includes: ${from}`
            : `Module Graph ${id} rules reference unknown member ${to}`,
      });
    }
  }
  return [...new Map(issues.map((issue) => [issue.message, issue])).values()];
}

function findRuleCycles(
  id: string,
  graph: ResolvedConfig['graphs'][string],
): readonly ConfigValidationIssue[] {
  const members = new Set(Object.keys(graph.members));
  const edges = new Map<string, readonly string[]>(
    Object.entries(graph.rules).map(([from, destinations]) => [
      from,
      destinations.filter((to) => members.has(to) && to !== from),
    ]),
  );
  const state = new Map<string, 'visiting' | 'done'>();
  const cycles: string[] = [];
  const visit = (member: string, trail: readonly string[]): void => {
    if (state.get(member) === 'done') return;
    if (state.get(member) === 'visiting') {
      const start = trail.indexOf(member);
      cycles.push(trail.slice(start).sort().join(', '));
      return;
    }
    state.set(member, 'visiting');
    for (const to of [...(edges.get(member) ?? [])].sort()) {
      visit(to, [...trail, member]);
    }
    state.set(member, 'done');
  };
  for (const member of [...members].sort()) visit(member, []);
  return [...new Set(cycles)].sort().map((cycle) => ({
    kind: 'cycle' as const,
    message: `Module Graph ${id} rule cycle includes: ${cycle}`,
  }));
}

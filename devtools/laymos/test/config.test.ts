import { describe, expect, it } from 'vitest';

import {
  defineConfig,
  edge,
  layer,
  layerGraph,
  markdown,
  module,
  projectNarrative,
  rules,
} from '../src/index.js';
import { validateConfig } from '../src/config/define-config.js';
import type { LaymosConfig } from '../src/config/types.js';

const issues = (config: LaymosConfig): string =>
  validateConfig(config).issues.join('\n');

describe('config', () => {
  it('normalizes project-relative plain paths', () => {
    const app = layer('app', ['./src//app/'], { description: 'App' });
    const appModule = module('./src/app/feature/../billing/', {
      description: 'Billing',
    });
    const authored = defineConfig({
      sourceRoots: ['src', 'generated', 'cache'],
      graphs: [
        layerGraph(
          'application',
          [edge(app, layer('core', ['src/core'], { description: 'Core' }))],
          { description: 'Application architecture' },
        ),
      ],
      modules: [appModule],
      ignore: ['./generated/', 'tmp/../cache'],
    });

    const config = validateConfig(authored).config;
    expect(config.graphs[0]?.layers[0]?.paths).toEqual(['src/app']);
    expect(config.modules?.[0]?.path).toBe('src/app/billing');
    expect(config.sourceRoots).toEqual(['src', 'generated', 'cache']);
    expect(config.ignore).toEqual(['generated', 'cache']);
  });

  it('requires non-overlapping source roots containing every configured path', () => {
    const app = layer('app', ['src/app'], { description: 'App' });
    const graph = layerGraph(
      'application',
      [edge(app, layer('core', ['src/core'], { description: 'Core' }))],
      { description: 'Application architecture' },
    );

    expect(
      issues(defineConfig({ sourceRoots: [], graphs: [graph] })),
    ).toContain('At least one source root is required');
    expect(
      issues(
        defineConfig({
          sourceRoots: ['src', 'src/app'],
          graphs: [graph],
        }),
      ),
    ).toContain('overlap');
    expect(
      issues(defineConfig({ sourceRoots: ['other'], graphs: [graph] })),
    ).toContain('Layer path "src/app" is not inside any source root');
  });

  it.each(['/src', '../src', 'src/**'])('rejects invalid path %s', (path) => {
    const app = layer('app', [path], { description: 'App' });
    const sink = layer('sink', ['sink'], { description: 'Sink' });
    expect(
      issues(
        defineConfig({
          sourceRoots: ['.'],
          graphs: [
            layerGraph('application', [edge(app, sink)], {
              description: 'Application architecture',
            }),
          ],
        }),
      ),
    ).not.toBe('');
  });

  it('requires rules to reuse explicitly declared modules', () => {
    const app = layer('app', ['src'], { description: 'App' });
    const declared = module('src/declared', { description: 'Declared' });
    const missing = module('src/missing', { description: 'Missing' });

    expect(
      issues(
        defineConfig({
          sourceRoots: ['src', 'sink'],
          graphs: [
            layerGraph(
              'application',
              [edge(app, layer('sink', ['sink'], { description: 'Sink' }))],
              { description: 'Application architecture' },
            ),
          ],
          modules: [declared],
          moduleRules: [rules(declared, { canImport: [missing] })],
        }),
      ),
    ).toMatch(/must reuse module "src\/missing" from config\.modules/);
  });

  it('allows a non-sink layer to connect multiple graphs', () => {
    const feature = layer('feature', ['src/feature'], {
      description: 'Feature',
    });
    const core = layer('core', ['src/core'], { description: 'Core' });
    const foundation = layer('foundation', ['src/foundation'], {
      description: 'Foundation',
    });

    expect(
      issues(
        defineConfig({
          sourceRoots: ['src'],
          graphs: [
            layerGraph('feature', [edge(feature, core)], {
              description: 'Feature architecture',
            }),
            layerGraph('core', [edge(core, foundation)], {
              description: 'Core architecture',
            }),
          ],
        }),
      ),
    ).toBe('');
  });

  it('rejects multiple rule declarations for one module', () => {
    const app = layer('app', ['src'], { description: 'App' });
    const feature = module('src/feature', { description: 'Feature' });

    expect(
      issues(
        defineConfig({
          sourceRoots: ['src', 'sink'],
          graphs: [
            layerGraph(
              'application',
              [edge(app, layer('sink', ['sink'], { description: 'Sink' }))],
              { description: 'Application architecture' },
            ),
          ],
          modules: [feature],
          moduleRules: [
            rules(feature, { canImport: [] }),
            rules(feature, { canImportedBy: [] }),
          ],
        }),
      ),
    ).toMatch(/more than one rules declaration/);
  });

  it('reports every empty architecture description together', () => {
    const app = layer('app', ['src'], { description: ' ' });
    const sink = layer('sink', ['sink'], { description: '\n' });
    const feature = module('src/feature', { description: '\t' });

    const message = issues(
      defineConfig({
        sourceRoots: ['src', 'sink'],
        graphs: [
          layerGraph('application', [edge(app, sink)], { description: ' ' }),
        ],
        modules: [feature],
      }),
    );
    expect(message).toContain(
      'Layer Graph "application" description must not be empty',
    );
    expect(message).toContain('Layer "app" description must not be empty');
    expect(message).toContain('Layer "sink" description must not be empty');
    expect(message).toContain(
      'Module "src/feature" description must not be empty',
    );
  });

  it('validates Project Narrative metadata and Markdown content', () => {
    const app = layer('app', ['src'], { description: 'Application' });
    const sink = layer('sink', ['sink'], { description: 'Sink' });
    const graph = layerGraph('application', [edge(app, sink)], {
      description: 'Application architecture',
    });

    const message = issues(
      defineConfig({
        sourceRoots: ['src', 'sink'],
        graphs: [graph],
        project: projectNarrative(' ', markdown``),
      }),
    );
    expect(message).toContain('Project Narrative name must not be empty');
    expect(message).toContain(
      'Project Narrative Markdown content must not be empty',
    );
  });

  it('serializes inline and imported Project Narratives identically', () => {
    const app = layer('app', ['src'], { description: 'Application' });
    const sink = layer('sink', ['sink'], { description: 'Sink' });
    const graph = layerGraph('application', [edge(app, sink)], {
      description: 'Application architecture',
    });
    const content = markdown`
# Example
    `;
    const imported = projectNarrative('Example', content);

    const inline = defineConfig({
      sourceRoots: ['src', 'sink'],
      graphs: [graph],
      project: projectNarrative('Example', content),
    });
    const fromImport = defineConfig({
      sourceRoots: ['src', 'sink'],
      graphs: [graph],
      project: imported,
    });

    expect(JSON.parse(JSON.stringify(inline.project))).toEqual(
      JSON.parse(JSON.stringify(fromImport.project)),
    );
  });
});

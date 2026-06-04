import { rollup } from '@rollup/browser';
import { Context, Effect, Layer } from 'effect';
import { transform } from 'sucrase';

export class RollupService extends Context.Service<RollupService>()(
  'kishore-app:RollupService',
  {
    make: Effect.succeed({
      generate: async function (
        code: string,
        modules: Record<string, string> = {},
      ) {
        modules['__entry.ts'] = code;
        // TODO: For later.
        modules['./utils'] = '';
        const bundle = await rollup({
          input: '__entry.ts',
          plugins: [
            {
              name: 'loader',
              resolveId(source) {
                if (modules.hasOwnProperty(source)) {
                  return source;
                }
                return {
                  id: `https://esm.sh/${source}?bundle=true`,
                  external: true,
                };
              },
              load(id) {
                if (modules.hasOwnProperty(id)) {
                  return modules[id];
                }
                return fetch(id).then((res) => res.text());
              },

              transform(code, id) {
                const result = transform(code, {
                  transforms: ['typescript'],
                  filePath: id,
                  disableESTransforms: true,
                  sourceMapOptions: {
                    compiledFilename: id,
                  },
                });
                return {
                  code: result.code,
                  map: result.sourceMap,
                };
              },
            },
          ],
        });
        const generatedCode = (
          await bundle.generate({
            format: 'es',
            sourcemap: 'inline',
          })
        ).output[0].code;

        // Generate worker url from output.
        const url = URL.createObjectURL(
          new Blob([generatedCode], { type: 'application/javascript' }),
        );
        // Create worker from given url.
        const worker = new Worker(url, { type: 'module' });
        worker.onerror = console.error;
      },
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}

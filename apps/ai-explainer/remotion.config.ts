import { Config } from '@remotion/cli/config';
import { enableTailwind } from '@remotion/tailwind-v4';

// `?raw` imports a file's text, as in Vite: Walkthroughs show real source.
Config.overrideWebpackConfig((config) => {
  const tailwind = enableTailwind(config);
  const rules = (tailwind.module?.rules ?? []).map((rule) =>
    rule && typeof rule === 'object' && !rule.resourceQuery
      ? { ...rule, resourceQuery: { not: [/raw/] } }
      : rule,
  );
  return {
    ...tailwind,
    module: {
      ...tailwind.module,
      rules: [{ resourceQuery: /raw/, type: 'asset/source' }, ...rules],
    },
  };
});

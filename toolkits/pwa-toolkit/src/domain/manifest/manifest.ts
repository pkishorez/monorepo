import * as Schema from 'effect/Schema';

const Display = Schema.Literals([
  'fullscreen',
  'standalone',
  'minimal-ui',
  'browser',
]);

const DisplayOverride = Schema.Literals([
  'fullscreen',
  'standalone',
  'minimal-ui',
  'browser',
  'window-controls-overlay',
  'tabbed',
]);

const Orientation = Schema.Literals([
  'any',
  'natural',
  'landscape',
  'landscape-primary',
  'landscape-secondary',
  'portrait',
  'portrait-primary',
  'portrait-secondary',
]);

/** `purpose` is a space-separated list of `any`, `maskable`, `monochrome`. */
const ManifestImage = Schema.Struct({
  src: Schema.NonEmptyString,
  sizes: Schema.optionalKey(Schema.String),
  type: Schema.optionalKey(Schema.String),
  purpose: Schema.optionalKey(
    Schema.String.check(
      Schema.isPattern(
        /^(any|maskable|monochrome)( (any|maskable|monochrome))*$/,
      ),
    ),
  ),
});

const Screenshot = Schema.Struct({
  ...ManifestImage.fields,
  form_factor: Schema.optionalKey(Schema.Literals(['narrow', 'wide'])),
  label: Schema.optionalKey(Schema.String),
  platform: Schema.optionalKey(Schema.String),
});

const Shortcut = Schema.Struct({
  name: Schema.NonEmptyString,
  short_name: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  url: Schema.NonEmptyString,
  icons: Schema.optionalKey(Schema.Array(ManifestImage)),
});

/** The W3C Web App Manifest fields the toolkit understands. */
export const WebAppManifest = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  name: Schema.NonEmptyString,
  short_name: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  lang: Schema.optionalKey(Schema.String),
  dir: Schema.optionalKey(Schema.Literals(['ltr', 'rtl', 'auto'])),
  start_url: Schema.optionalKey(Schema.String),
  scope: Schema.optionalKey(Schema.String),
  display: Schema.optionalKey(Display),
  display_override: Schema.optionalKey(Schema.Array(DisplayOverride)),
  orientation: Schema.optionalKey(Orientation),
  theme_color: Schema.optionalKey(Schema.String),
  background_color: Schema.optionalKey(Schema.String),
  categories: Schema.optionalKey(Schema.Array(Schema.String)),
  icons: Schema.optionalKey(Schema.Array(ManifestImage)),
  screenshots: Schema.optionalKey(Schema.Array(Screenshot)),
  shortcuts: Schema.optionalKey(Schema.Array(Shortcut)),
});
export type WebAppManifest = typeof WebAppManifest.Type;

/** The manifest as emitted: `start_url` and `scope` `/`, `display` `standalone`, `id` = `start_url`. */
export const withManifestDefaults = (
  manifest: WebAppManifest,
): WebAppManifest => {
  const start_url = manifest.start_url ?? '/';
  return {
    ...manifest,
    id: manifest.id ?? start_url,
    start_url,
    scope: manifest.scope ?? '/',
    display: manifest.display ?? 'standalone',
  };
};

/** Icon URLs to precache: every icon, never screenshots. */
export const manifestIconUrls = (
  manifest: WebAppManifest,
): ReadonlyArray<string> =>
  [
    ...(manifest.icons ?? []),
    ...(manifest.shortcuts ?? []).flatMap((shortcut) => shortcut.icons ?? []),
  ].map((icon) => icon.src);

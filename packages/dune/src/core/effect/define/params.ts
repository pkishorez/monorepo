/*
 * An effect's params: each one a uniform its shader reads as `p.<name>`,
 * and enough said about it (range, step, label) to draw a control for it.
 */

/** A number param: a float uniform, drawn as a slider. */
export type NumberParam = {
  readonly kind: 'number';
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly label?: string | undefined;
};

/** A colour param: a vec3 uniform, written as `#rrggbb`, drawn as a picker. */
export type ColorParam = {
  readonly kind: 'color';
  readonly value: string;
  readonly label?: string | undefined;
};

export type Param = NumberParam | ColorParam;
export type ParamSpecs = Readonly<Record<string, Param>>;

/** The plain values of a set of params: numbers for numbers, hex strings for colours. */
export type ParamValues<P extends ParamSpecs> = {
  readonly [K in keyof P]: P[K] extends ColorParam ? string : number;
};

/** A number param from its default, range and step. */
export const num = (
  value: number,
  min: number,
  max: number,
  step = (max - min) / 100,
  label?: string,
): NumberParam => ({ kind: 'number', value, min, max, step, label });

/** A colour param from its default, as `#rrggbb`. */
export const color = (value: string, label?: string): ColorParam => ({
  kind: 'color',
  value,
  label,
});

/** `#rrggbb` (or `#rgb`) as 0..1 sRGB floats, as the shader takes them. */
export const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = Number.parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

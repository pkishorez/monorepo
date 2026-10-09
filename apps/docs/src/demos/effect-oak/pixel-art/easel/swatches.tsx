/** The palette: one swatch per color, the selected one ringed. */
export const Swatches = ({
  colors,
  selected,
  onSelect,
}: {
  readonly colors: ReadonlyArray<string>;
  readonly selected: number;
  readonly onSelect: (index: number) => void;
}) => (
  <div role="radiogroup" aria-label="Color" className="grid grid-cols-4 gap-1">
    {colors.map((color, index) => (
      <button
        key={index}
        type="button"
        role="radio"
        aria-checked={index === selected}
        aria-label={`Color ${index + 1}`}
        className={`size-7 rounded border border-neutral-600 ${index === selected ? 'ring-2 ring-sky-400 ring-offset-1 ring-offset-background' : ''}`}
        style={{ backgroundColor: color }}
        onClick={() => onSelect(index)}
      />
    ))}
  </div>
);

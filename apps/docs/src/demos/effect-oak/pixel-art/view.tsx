import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@kstackz/web-platform/components/native-select';
import { Spinner } from '@kstackz/web-platform/components/spinner';
import {
  Cells,
  ConfirmResize,
  History,
  Swatches,
  useRelease,
  useUndoKeys,
} from './easel/index.js';
import { ExportView } from './export/index.js';
import { mirrored, SIZES } from './grid.js';
import { colorsOf, EMPTY, THEMES } from './palette.js';
import { PixelArt } from './pixel-art.js';
import { ToolsView } from './tools/index.js';

export const PixelArtView = View.make(PixelArt, {
  Loading: () => (
    <div className="flex size-full items-center justify-center">
      <Spinner />
    </div>
  ),

  Ready: ({ state, children, send }) => {
    const colors = colorsOf(state.theme);
    useUndoKeys(
      () => send({ _tag: 'ClickedUndo' }),
      () => send({ _tag: 'ClickedRedo' }),
    );
    useRelease(state.drawing, () => send({ _tag: 'ReleasedPointer' }));
    const preview = state.hovered
      ? mirrored(
          state.hovered.x,
          state.hovered.y,
          state.size,
          state.tool === 'Fill' ? 'None' : state.mirror,
        )
      : [];
    return (
      <div className="flex size-full flex-col gap-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-lg font-semibold">Pixel Art</h1>
          <Button
            size="sm"
            variant="outline"
            disabled={state.undo.length === 0}
            onClick={() => send({ _tag: 'ClickedUndo' })}
          >
            Undo
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={state.redo.length === 0}
            onClick={() => send({ _tag: 'ClickedRedo' })}
          >
            Redo
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => send({ _tag: 'ClickedClear' })}
          >
            Clear
          </Button>
          <ExportView node={children.export} />
        </div>
        <div className="flex flex-wrap items-start justify-center gap-6">
          <div className="flex w-40 flex-col gap-4">
            <ToolsView node={children.tools} />
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">Grid size</p>
              <div
                role="radiogroup"
                aria-label="Grid size"
                className="flex gap-1"
              >
                {SIZES.map((size) => (
                  <Button
                    key={size}
                    size="sm"
                    role="radio"
                    aria-checked={state.size === size}
                    variant={state.size === size ? 'default' : 'outline'}
                    onClick={() => send({ _tag: 'SelectedSize', size })}
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">Palette</p>
              <NativeSelect
                aria-label="Palette"
                size="sm"
                value={String(state.theme)}
                onChange={(event) =>
                  send({
                    _tag: 'SelectedTheme',
                    theme: Number(event.target.value),
                  })
                }
              >
                {THEMES.map((theme, index) => (
                  <NativeSelectOption key={theme.name} value={String(index)}>
                    {theme.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Swatches
                colors={colors}
                selected={state.color}
                onSelect={(color) => send({ _tag: 'SelectedColor', color })}
              />
            </div>
          </div>
          <Cells
            grid={state.grid}
            colors={colors}
            empty={EMPTY}
            preview={preview}
            onPress={(x, y) => send({ _tag: 'PressedCell', x, y })}
            onEnter={(x, y) => send({ _tag: 'EnteredCell', x, y })}
            onLeave={() => send({ _tag: 'LeftCanvas' })}
          />
          <div className="w-40">
            <History
              undo={state.undo}
              redo={state.redo}
              colors={colors}
              empty={EMPTY}
              onUndoTo={(index) => send({ _tag: 'ClickedHistoryStep', index })}
              onRedoTo={(index) => send({ _tag: 'ClickedRedoStep', index })}
            />
          </div>
        </div>
        <ConfirmResize
          size={state.pendingSize}
          onConfirm={() => send({ _tag: 'ConfirmedResize' })}
          onCancel={() => send({ _tag: 'CancelledResize' })}
        />
      </div>
    );
  },
});

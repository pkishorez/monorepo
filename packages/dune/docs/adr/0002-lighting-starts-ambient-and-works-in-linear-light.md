# Lighting starts ambient, and works in linear light

`lighting` shows everything at its Ambient share of its own colour wherever the light is, then adds the pointer's light on top. The maths is done in linear light and turned back to sRGB at the end. A colour too bright to show is scaled back whole, with a little of an OKLCH fit to the gamut, so it gives up chroma and never hue. A Lamp shows its own colour exactly.

## Considered Options

- **A dark scene that only the light reveals**: rejected. Text away from the light was dark and looked pixelated; a page has to be readable with the pointer anywhere.
- **Clip each channel in sRGB**: rejected. A lit orange turned yellow: red stopped at 1 while green kept climbing.
- **Emboss text from the height map by default**: rejected. The map is drawn at half size, so shading glyphs from it pixelated them. `emboss` stays as a Param, at 0.
- **A warm light by default**: rejected. It tinted every colour; the light is white, and an amount.

## Consequences

- The page looks as designed with no light on it; the light highlights.
- Brand colours stay their hue under any light: the playground's orange reads `rgb(255, 105, 0)` under the light and away from it.
- Every Effect gets `toLinear`, `toSrgb`, `oklab`, `fromOklab` and `fitGamut` to do the same.

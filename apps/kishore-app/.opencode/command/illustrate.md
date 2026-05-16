---
description: Generate SVG illustrations for MDX files based on markers
subtask: true
model: 'google/gemini-3-pro-preview'
---

Generate SVG illustrations for the specified MDX file.

**File to process:** $ARGUMENTS

## Instructions

1. **Read the MDX file** at the path provided in arguments

2. **Find all illustration markers** matching this pattern:

   ```
   -- [illustrate: description here]
   ```

3. **For each marker found**, generate an SVG illustration:
   - Analyze the description to understand what to illustrate
   - Create clean, minimal SVG using geometric shapes (circle, rect, path, line, text)
   - Use Tailwind CSS classes for theming:
     - `fill-background` for backgrounds
     - `fill-foreground` or `stroke-foreground` for main elements
     - `fill-primary` or `stroke-primary` for accent/highlight elements
     - `fill-muted-foreground` for secondary text
     - Use opacity modifiers like `fill-primary/20` for subtle fills
   - Ensure colors work well on both light and dark backgrounds
   - Use appropriate viewBox (typically `0 0 400 200` or similar)
   - Add `className="w-full h-auto"` to the svg element
   - **Important**:
     - Use `strokeWidth="1"` for all strokes to ensure sharp, clean lines
     - For vertical text alignment, use `style={{ dominantBaseline: 'middle' }}` and set `y` to the vertical center of the container
     - Ensure sharp rendering by avoiding anti-aliasing artifacts where possible

4. **Create a React Component** for the illustration:
   - Create a `components/image.tsx` file in the same directory as the MDX file (create the `components` folder if it doesn't exist).
   - If multiple images are needed, use descriptive names or multiple exports in `components/image.tsx`.
   - Wrap the SVG in a component that imports `SvgImage` from `@/components/svg-image`.
   - Add a `title` prop to `SvgImage` with a short, descriptive title derived from the illustration description.

   ```tsx
   import { SvgImage } from '@/components/svg-image';

   export function DiagramName() {
     return (
       <SvgImage title="Title describing the diagram">
         <svg viewBox="0 0 400 200" className="w-full h-auto">
           {/* ... svg content ... */}
         </svg>
       </SvgImage>
     );
   }
   ```

5. **Update the MDX file**:
   - Import the new component at the top (or near where it's used if using MDX 2 features):
     ```jsx
     import { DiagramName } from './components/image';
     ```
   - Replace the marker with the component usage:
     ```jsx
     <DiagramName />
     ```

6. **Remove the marker entirely** - do not keep the `-- [illustrate: ...]` comment

## SVG Style Guidelines

- **Colors**: Use Tailwind CSS classes for consistent theming:
  - `fill-background` / `fill-foreground`
  - `fill-primary` / `stroke-primary`
  - `fill-muted-foreground`
  - **Accents**: Use specific colors like `fill-blue-500`, `stroke-green-500`, `stroke-red-500` for semantic meaning (e.g., success, error, running state).
  - **Opacity**: Use modifiers like `fill-primary/20` or `stroke-blue-500/50`.
- **Structure**:
  - Keep illustrations clean and minimal.
  - Use `strokeWidth="1"` or `1.5` for sharp lines.
  - Use `shapeRendering="geometricPrecision"` for crisp edges.
  - Center text using `textAnchor="middle"` and `style={{ dominantBaseline: 'middle' }}`.
- **Concepts**:
  - Effects: circles/rects
  - Fibers: parallel lines
  - Connections: arrows/lines with markers
  - Data flow: dashed lines

## Example

**Before:**

```mdx
Some content here.

-- [illustrate: An Effect diagram]
```

**After (in MDX):**

```mdx
import { EffectDiagram } from './components/image';

Some content here.

<EffectDiagram />
```

**After (in `components/image.tsx`):**

```tsx
import { SvgImage } from '@/components/svg-image';

export function EffectDiagram() {
  return (
    <SvgImage>
      <svg ...>
        {/* SVG content using Tailwind classes like fill-blue-500, stroke-red-500 etc. */}
      </svg>
    </SvgImage>
  );
}
```

## Output

After processing, report:

- Number of illustrations generated
- Brief description of each illustration created
- Confirm the file has been updated

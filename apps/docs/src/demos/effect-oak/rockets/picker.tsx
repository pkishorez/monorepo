import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@kstackz/web-platform/components/select';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@kstackz/web-platform/components/toggle-group';
import { CHAPTERS } from './chapters.js';
import type { Chapter } from './chapters.js';
import { LOOKS } from './look/index.js';
import type { LookName } from './look/index.js';

const label = (chapter: number) =>
  `${chapter}. ${CHAPTERS[chapter - 1]!.title}`;

const ITEMS = Object.fromEntries(
  CHAPTERS.map((_, index) => [String(index + 1), label(index + 1)]),
);

/** Which chapter runs, and in which Look. */
export const Picker = ({
  chapter,
  look,
  onChapter,
  onLook,
}: {
  readonly chapter: Chapter;
  readonly look: LookName;
  readonly onChapter: (chapter: Chapter) => void;
  readonly onLook: (look: LookName) => void;
}) => (
  <div className="flex flex-1 items-center justify-end gap-2">
    <Select
      items={ITEMS}
      value={String(chapter)}
      onValueChange={(value) => onChapter(Number(value) as Chapter)}
    >
      <SelectTrigger size="sm" aria-label="Chapter" className="min-w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Walkthrough</SelectLabel>
          {CHAPTERS.map(
            (chapter, index) =>
              !('deeper' in chapter) && (
                <SelectItem key={chapter.title} value={String(index + 1)}>
                  {label(index + 1)}
                </SelectItem>
              ),
          )}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Going deeper</SelectLabel>
          {CHAPTERS.map(
            (chapter, index) =>
              'deeper' in chapter && (
                <SelectItem key={chapter.title} value={String(index + 1)}>
                  {label(index + 1)}
                </SelectItem>
              ),
          )}
        </SelectGroup>
      </SelectContent>
    </Select>
    <ToggleGroup
      aria-label="Look"
      size="sm"
      variant="outline"
      spacing={0}
      value={[look]}
      onValueChange={([next]) => next && onLook(next as LookName)}
    >
      {Object.keys(LOOKS).map((name) => (
        <ToggleGroupItem key={name} value={name} className="capitalize">
          {name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  </div>
);

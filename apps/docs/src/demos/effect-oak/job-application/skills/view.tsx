import { View } from 'effect-oak/react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@kstackz/web-platform/components/button';
import { Label } from '@kstackz/web-platform/components/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@kstackz/web-platform/components/radio-group';
import { errorOf, TextInput } from '../fields/index.js';
import { LEVELS, NAME_RULES, Skills } from './skills.js';

const isLevel = (value: string): value is (typeof LEVELS)[number] =>
  (LEVELS as ReadonlyArray<string>).includes(value);

export const SkillsView = View.make(Skills, ({ model, send }) => (
  <div className="flex flex-col gap-4">
    {model.entries.map((entry, index) => (
      <section
        key={entry.id}
        className="flex flex-col gap-3 rounded-lg border p-4"
      >
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextInput
              id={`skill-${entry.id}`}
              label={`Skill ${index + 1}`}
              placeholder="TypeScript"
              value={entry.name.value}
              error={errorOf(NAME_RULES, entry.name)}
              onChange={(value) =>
                send({ _tag: 'EditedName', id: entry.id, value })
              }
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove skill ${index + 1}`}
            onClick={() => send({ _tag: 'ClickedRemove', id: entry.id })}
          >
            <Trash2 />
          </Button>
        </div>
        <RadioGroup
          aria-label="Proficiency"
          className="flex flex-wrap gap-4"
          value={entry.proficiency}
          onValueChange={(level) => {
            if (isLevel(level))
              send({ _tag: 'ChoseLevel', id: entry.id, level });
          }}
        >
          {LEVELS.map((level) => (
            <div key={level} className="flex items-center gap-2">
              <RadioGroupItem id={`skill-${entry.id}-${level}`} value={level} />
              <Label htmlFor={`skill-${entry.id}-${level}`}>{level}</Label>
            </div>
          ))}
        </RadioGroup>
      </section>
    ))}
    {model.entries.length === 0 && (
      <p className="text-sm text-destructive">Add at least one skill.</p>
    )}
    <Button
      variant="outline"
      className="self-start"
      onClick={() => send({ _tag: 'ClickedAdd' })}
    >
      <Plus /> Add skill
    </Button>
  </div>
));

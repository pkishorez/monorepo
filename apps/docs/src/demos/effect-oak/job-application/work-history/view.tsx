import { View } from 'effect-oak/react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@kstackz/web-platform/components/button';
import { Checkbox } from '@kstackz/web-platform/components/checkbox';
import { Label } from '@kstackz/web-platform/components/label';
import { errorOf, TextArea, TextInput } from '../fields/index.js';
import { RULES } from './entry.js';
import { WorkHistory } from './work-history.js';

export const WorkHistoryView = View.make(WorkHistory, ({ model, send }) => (
  <div className="flex flex-col gap-4">
    {model.entries.map((entry, index) => {
      const id = (field: string) => `work-${entry.id}-${field}`;
      return (
        <section
          key={entry.id}
          className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
        >
          <div className="flex items-center justify-between sm:col-span-2">
            <h3 className="text-sm font-medium">Position {index + 1}</h3>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Remove position ${index + 1}`}
              onClick={() => send({ _tag: 'ClickedRemove', id: entry.id })}
            >
              <Trash2 /> Remove
            </Button>
          </div>
          <TextInput
            id={id('company')}
            label="Company"
            value={entry.company.value}
            error={errorOf(RULES.company, entry.company)}
            onChange={(value) =>
              send({ _tag: 'Edited', id: entry.id, field: 'company', value })
            }
          />
          <TextInput
            id={id('title')}
            label="Job title"
            value={entry.title.value}
            error={errorOf(RULES.title, entry.title)}
            onChange={(value) =>
              send({ _tag: 'Edited', id: entry.id, field: 'title', value })
            }
          />
          <TextInput
            id={id('start')}
            label="Start date"
            type="date"
            max={entry.end}
            value={entry.start}
            onChange={(value) =>
              send({
                _tag: 'EditedDetail',
                id: entry.id,
                field: 'start',
                value,
              })
            }
          />
          {entry.current ? (
            <div />
          ) : (
            <TextInput
              id={id('end')}
              label="End date"
              type="date"
              min={entry.start}
              value={entry.end}
              onChange={(value) =>
                send({
                  _tag: 'EditedDetail',
                  id: entry.id,
                  field: 'end',
                  value,
                })
              }
            />
          )}
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              id={id('current')}
              checked={entry.current}
              onCheckedChange={(checked) =>
                send({
                  _tag: 'ToggledCurrent',
                  id: entry.id,
                  current: checked === true,
                })
              }
            />
            <Label htmlFor={id('current')}>I currently work here</Label>
          </div>
          <div className="sm:col-span-2">
            <TextArea
              id={id('description')}
              label="Description (optional)"
              rows={3}
              value={entry.description}
              onChange={(value) =>
                send({
                  _tag: 'EditedDetail',
                  id: entry.id,
                  field: 'description',
                  value,
                })
              }
            />
          </div>
        </section>
      );
    })}
    {model.entries.length === 0 && (
      <p className="text-sm text-destructive">Add at least one position.</p>
    )}
    <Button
      variant="outline"
      className="self-start"
      onClick={() => send({ _tag: 'ClickedAdd' })}
    >
      <Plus /> Add position
    </Button>
  </div>
));

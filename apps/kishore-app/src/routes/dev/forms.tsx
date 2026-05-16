import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@monorepo/frontend/components/ui/button';
import { ArrowLeft, SunIcon } from '@monorepo/frontend/lucide';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monorepo/frontend/components/ui/select';
import { useTheme } from '@/components/theme';
import { ContactDemo } from './components/contact-demo';
import { RegistrationDemo } from './components/registration-demo';
import { ConditionalDemo } from './components/conditional-demo';
import { DependentDemo } from './components/dependent-demo';
import { ArrayDemo } from './components/array-demo';
import { KitchenSinkDemo } from './components/kitchen-sink-demo';
import { CustomErrorsDemo } from './components/custom-errors-demo';

export const Route = createFileRoute('/dev/forms')({
  component: FormsPage,
});

const scenarios = [
  { value: 'contact', label: 'Contact — basic fields + validation' },
  { value: 'registration', label: 'Registration — password confirm + select' },
  { value: 'conditional', label: 'Conditional — show/hide fields' },
  { value: 'dependent', label: 'Dependent — cascading selects' },
  { value: 'array', label: 'Array — dynamic key-value list' },
  { value: 'custom-errors', label: 'Custom Errors — contextual messages' },
  { value: 'kitchen-sink', label: 'Kitchen Sink — every field type' },
] as const;

type Scenario = (typeof scenarios)[number]['value'];

const scenarioComponents: Record<Scenario, () => React.JSX.Element> = {
  contact: ContactDemo,
  registration: RegistrationDemo,
  conditional: ConditionalDemo,
  dependent: DependentDemo,
  array: ArrayDemo,
  'custom-errors': CustomErrorsDemo,
  'kitchen-sink': KitchenSinkDemo,
};

function FormsPage() {
  const { toggleTheme } = useTheme();
  const [scenario, setScenario] = useState<Scenario>('contact');
  const Demo = scenarioComponents[scenario];

  return (
    <div className="min-h-dvh">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
        <div className="max-w-xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dev">
              <Button variant="ghost" size="icon-sm">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-foreground/90">Forms</h1>
              <p className="text-muted-foreground text-xs">
                @monorepo/frontend/form
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={toggleTheme}>
            <SunIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="max-w-xl mx-auto p-8 space-y-6">
        <Select
          value={scenario}
          onValueChange={(v) => setScenario(v as Scenario)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {scenarios.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Demo key={scenario} />
      </div>
    </div>
  );
}

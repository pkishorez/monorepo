import { createFileRoute } from '@tanstack/react-router';
import { KeyboardShowcase } from '../showcases/keyboard/index.ts';

export const Route = createFileRoute('/keyboard')({
  component: KeyboardShowcase,
});

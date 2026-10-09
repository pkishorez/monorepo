import { createFileRoute } from '@tanstack/react-router';
import { Home } from '../../screens/places/home/index.ts';

export const Route = createFileRoute('/_ledger/')({ component: Home });

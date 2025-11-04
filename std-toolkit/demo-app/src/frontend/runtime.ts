import { ManagedRuntime } from 'effect';
import { ApiService } from './api';

export const runtime = ManagedRuntime.make(ApiService.Default);

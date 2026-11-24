import { useState } from 'react'; // ✗ restriction
import type { JSX } from 'react/jsx-runtime'; // ✗ restriction
import { part } from '../feature/index.ts'; // ✗ restriction
import { x } from '../lib/deep/index.ts';
export const calc = [useState, part, x];
export type Element = JSX.Element;

// Reads a Project at a branch as a Monorepo or a Single Package: its
// Packages, how they depend on each other, the cycles among them, its
// Package Manager.
export { analyzeMonorepo } from './analyze-monorepo.js';
export type { WorkspaceAnalysis } from './engine.js';

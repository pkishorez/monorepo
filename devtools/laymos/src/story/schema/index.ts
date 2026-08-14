// RPC transports and renderers use this browser-safe Story report contract.
export {
  CapturedTraceSchema,
  RecordedFlowSchema,
  StoryAssertionSchema,
  StoryReportSchema,
  StorySectionSchema,
  StoryVerdictSchema,
} from './story-report-schema.js';
export type {
  CapturedTrace,
  JsonValue,
  RecordedFlow,
  StoryAssertion,
  StoryReport,
  StorySection,
  StoryVerdict,
} from './story-report-schema.js';
export {
  StoryLeafSchema,
  StoryTreeGroupSchema,
  StoryTreeSchema,
} from './story-tree-schema.js';
export type {
  StoryLeaf,
  StoryTree,
  StoryTreeGroup,
} from './story-tree-schema.js';

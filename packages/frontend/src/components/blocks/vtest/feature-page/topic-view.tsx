import { ArrowLeftIcon } from 'lucide-react';

import { Button } from '#components/ui/button';

import type { FeatureTopic } from '../feature-model';
import { Markdown } from '../markdown';
import { TestGroup } from '../test-group';
import type { TestStatus } from '../types';

interface TopicViewProps {
  topic: FeatureTopic;
  onBack: () => void;
  /** Live roll-up status for a group in this topic. */
  groupStatus?: (groupId: string) => TestStatus | undefined;
  /** Run a whole group. */
  onRunGroup?: (groupId: string) => void;
  /** Live status for a single test inside a group. */
  testStatus?: (groupId: string, name: string) => TestStatus | undefined;
  /** Run a single test inside a group. */
  onRunTest?: (groupId: string, name: string) => void;
}

/**
 * A single revealed topic: its markdown plus a live `<TestGroup>` for each
 * group referenced by the topic's directives, wired to the route's stream.
 */
export function TopicView({
  topic,
  onBack,
  groupStatus,
  onRunGroup,
  testStatus,
  onRunTest,
}: TopicViewProps) {
  return (
    <article className="flex flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-muted-foreground"
        onClick={onBack}
      >
        <ArrowLeftIcon className="size-4" />
        All topics
      </Button>

      <h2 className="text-xl font-semibold">{topic.title}</h2>

      {topic.markdown.length > 0 && <Markdown source={topic.markdown} />}

      {topic.groups.length > 0 && (
        <div className="flex flex-col gap-3">
          {topic.groups.map((group) => (
            <TestGroup
              key={group.id}
              groupId={group.id}
              tests={group.tests}
              status={groupStatus?.(group.id)}
              onRun={onRunGroup ? () => onRunGroup(group.id) : undefined}
              testStatus={
                testStatus ? (name) => testStatus(group.id, name) : undefined
              }
              onRunTest={
                onRunTest ? (name) => onRunTest(group.id, name) : undefined
              }
            />
          ))}
        </div>
      )}
    </article>
  );
}

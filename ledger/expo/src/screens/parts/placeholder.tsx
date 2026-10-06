import { Card } from '@kstackz/expo-toolkit/components/card';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

/**
 * A Place still to be drawn: what it will show, and anything it can already
 * do. Phase 3b replaces each one with the Place itself.
 */
export function Placeholder(props: {
  readonly title: string;
  readonly description: string;
  readonly children?: ReactNode;
}) {
  return (
    <ScrollView contentContainerClassName="gap-4 p-4 pb-28">
      <Card>
        <Card.Header>
          <Card.Title>{props.title}</Card.Title>
          <Card.Description>{props.description}</Card.Description>
        </Card.Header>
        {props.children !== undefined && (
          <Card.Content className="gap-3">{props.children}</Card.Content>
        )}
      </Card>
    </ScrollView>
  );
}

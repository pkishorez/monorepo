import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';

export function Hello({ name = 'world' }: { name?: string }) {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Hello, {name}!</CardTitle>
      </CardHeader>
      <CardContent>
        <Button>Click me</Button>
      </CardContent>
    </Card>
  );
}

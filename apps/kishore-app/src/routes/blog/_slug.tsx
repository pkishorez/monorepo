import { Back, Layout } from '@/components/layout';
import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/blog/_slug')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Layout left={<Back to="/blog" />}>
      <Outlet />
    </Layout>
  );
}

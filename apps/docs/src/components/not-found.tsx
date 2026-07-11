import { baseOptions } from '@/lib/layout.shared';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { DefaultNotFound } from 'fumadocs-ui/layouts/home/not-found';
import { HomeHeader } from './home-header';

export function NotFound() {
  return (
    <HomeLayout {...baseOptions()} slots={{ header: HomeHeader }}>
      <DefaultNotFound />
    </HomeLayout>
  );
}

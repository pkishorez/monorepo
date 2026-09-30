import {
  AppShell,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@kstackz/ui-toolkit/components/blocks/app-shell';
import { Link, useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { appTheme } from '../../common/theme.ts';
import { Stage, StageScreen } from './stage/index.ts';
import { GROUPS } from './topics.ts';

// Plain sRGB per theme, as the App Shell Showcase explains.
const STATUS_BAR = {
  shut: 'light-dark(#ffffff, #0a0a0a)', // --background
  open: 'light-dark(#fafafa, #151515)', // --sidebar
};

const TOPICS = GROUPS.flatMap((group) => group.topics);
const topicAt = (slug: string) => TOPICS.find((t) => t.slug === slug);
const scenarioAt = (topic: string, scenario: string) =>
  topicAt(topic)?.scenarios.find((s) => s.slug === scenario);

/** The Topic the Showcase opens on. */
export const FIRST_TOPIC = TOPICS[0]!.slug;

/** Whether a Topic lives at this slug. */
export const hasTopic = (slug: string) => topicAt(slug) !== undefined;

/** Whether a Topic has a Scenario at this slug. */
export const hasScenario = (topic: string, scenario: string) =>
  scenarioAt(topic, scenario) !== undefined;

/**
 * The Gestures Showcase: what use-gesture can do, one Topic per page, in an
 * App Shell whose sidebar opens only from the screen's left edge, so a
 * Swipe on a demo is always the demo's.
 */
export function GesturesShowcase(props: { readonly children: ReactNode }) {
  const slug = useLocation({
    select: (location) => location.pathname.split('/')[2],
  });
  const here = (slug === undefined ? undefined : topicAt(slug)) ?? TOPICS[0]!;
  return (
    <AppShell
      style={{ viewTransitionName: 'showcase' }}
      swipe="edge"
      statusBar={(open) => (
        <appTheme.StatusBar color={open ? STATUS_BAR.open : STATUS_BAR.shut} />
      )}
      sidebar={{
        header: <AppLink />,
        nav: GROUPS.map((group) => ({
          label: group.label,
          items: group.topics.map((topic) => ({
            title: topic.title,
            icon: topic.icon,
            active: topic.slug === here.slug,
            render: (
              <Link to="/gestures/$topic" params={{ topic: topic.slug }} />
            ),
          })),
        })),
      }}
      header={{
        title: here.title,
        actions: here.Tweaks ? <here.Tweaks key={here.slug} /> : undefined,
      }}
    >
      {props.children}
    </AppShell>
  );
}

/** A Topic's page: its title, then each Scenario. */
export function TopicPage(props: { readonly slug: string }) {
  const topic = topicAt(props.slug);
  if (topic === undefined) return null;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-6">
      {topic.scenarios.map((scenario) => (
        <Stage key={scenario.slug} topic={topic.slug} scenario={scenario} />
      ))}
    </div>
  );
}

/** A Scenario that needs the whole screen, shown alone. */
export function ScenarioScreen(props: {
  readonly topic: string;
  readonly scenario: string;
}) {
  const scenario = scenarioAt(props.topic, props.scenario);
  return scenario === undefined ? null : (
    <StageScreen topic={props.topic} scenario={scenario} />
  );
}

/** Atop the sidebar: this Showcase, and the way back to every Showcase. */
function AppLink() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" render={<Link to="/" />}>
          <img
            src="/favicon.svg"
            alt=""
            className="size-8 shrink-0 rounded-lg"
          />
          <span className="grid flex-1 text-left leading-tight">
            <span className="truncate font-medium">Gestures</span>
            <span className="truncate text-xs text-muted-foreground">
              All showcases
            </span>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

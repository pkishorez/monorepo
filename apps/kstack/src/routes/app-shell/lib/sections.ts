import {
  CalendarIcon,
  FileTextIcon,
  FolderKanbanIcon,
  LayoutDashboardIcon,
  ListTodoIcon,
  type LucideIcon,
  NotebookPenIcon,
} from '@kstackz/ui-toolkit/lucide';

/** One place the sidebar goes to, and the rows its page lists. */
export interface Section {
  readonly slug: string;
  readonly title: string;
  readonly icon: LucideIcon;
  readonly rows: ReadonlyArray<{
    readonly title: string;
    readonly meta: string;
  }>;
}

export interface SectionGroup {
  readonly label: string;
  readonly sections: ReadonlyArray<Section>;
}

/** The sidebar, top to bottom. The first Section is the Example's home. */
export const GROUPS: ReadonlyArray<SectionGroup> = [
  {
    label: 'Workspace',
    sections: [
      {
        slug: 'overview',
        title: 'Overview',
        icon: LayoutDashboardIcon,
        rows: [
          { title: 'Quarterly planning', meta: 'Updated 2 hours ago' },
          { title: 'Onboarding checklist', meta: 'Updated yesterday' },
          { title: 'Design review notes', meta: 'Updated Monday' },
        ],
      },
      {
        slug: 'projects',
        title: 'Projects',
        icon: FolderKanbanIcon,
        rows: [
          { title: 'Mobile app', meta: '12 open tasks' },
          { title: 'Billing migration', meta: '4 open tasks' },
          { title: 'Marketing site', meta: '7 open tasks' },
          { title: 'Search', meta: 'No open tasks' },
        ],
      },
      {
        slug: 'tasks',
        title: 'Tasks',
        icon: ListTodoIcon,
        rows: [
          { title: 'Write the release notes', meta: 'Due today' },
          { title: 'Review the pricing page', meta: 'Due tomorrow' },
          { title: 'Plan the offsite', meta: 'Due Friday' },
        ],
      },
      {
        slug: 'calendar',
        title: 'Calendar',
        icon: CalendarIcon,
        rows: [
          { title: 'Standup', meta: 'Today, 9:30' },
          { title: 'Design review', meta: 'Today, 14:00' },
          { title: 'One-on-one', meta: 'Tomorrow, 11:00' },
        ],
      },
    ],
  },
  {
    label: 'Library',
    sections: [
      {
        slug: 'notes',
        title: 'Notes',
        icon: NotebookPenIcon,
        rows: [
          { title: 'Ideas for the next quarter', meta: '3 days ago' },
          { title: 'Interview questions', meta: 'Last week' },
        ],
      },
      {
        slug: 'files',
        title: 'Files',
        icon: FileTextIcon,
        rows: [
          { title: 'Brand guidelines.pdf', meta: '2.4 MB' },
          { title: 'Roadmap.key', meta: '18 MB' },
          { title: 'Invoices 2026.xlsx', meta: '640 KB' },
        ],
      },
    ],
  },
];

export const HOME = GROUPS[0]!.sections[0]!;

export const sectionAt = (slug: string): Section | undefined =>
  GROUPS.flatMap((group) => group.sections).find((s) => s.slug === slug);

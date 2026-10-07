import type { ComponentType, ReactElement } from 'react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '../blocks.tsx';

/** A place to go: its name, icon, whether it's here, and the link to it. */
export interface NavItem {
  readonly title: string;
  readonly icon?: ComponentType<{ readonly 'aria-hidden'?: boolean }>;
  readonly active?: boolean;
  /** The link, such as a router's `<Link to=… />`; its children are filled in. */
  readonly render: ReactElement;
}

/** The sidebar's places, in groups, each with an optional label. */
export type Nav = ReadonlyArray<{
  readonly label?: string;
  readonly items: ReadonlyArray<NavItem>;
}>;

export function NavList(props: { readonly nav: Nav }) {
  return props.nav.map((group, index) => (
    <SidebarGroup key={group.label ?? index}>
      {group.label === undefined ? null : (
        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton isActive={item.active} render={item.render}>
                {item.icon === undefined ? null : <item.icon aria-hidden />}
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}

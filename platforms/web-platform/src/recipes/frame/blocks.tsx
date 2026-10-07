import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cn } from 'cn';
import {
  type ComponentProps,
  type CSSProperties,
  type MouseEvent,
  useState,
} from 'react';
import { Input } from '#components/ui/input';
import { Skeleton } from '#components/ui/skeleton';
import { useFrame } from './frame/index.ts';

/*
 * The pieces a sidebar is built from, for content the `nav` list can't
 * describe. `nav` is built from them too, so both look alike.
 */

export function SidebarGroup({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
      {...props}
    />
  );
}

export function SidebarGroupLabel({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        'flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 [&>svg]:size-4 [&>svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}

export function SidebarGroupContent({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group-content"
      className={cn('w-full text-sm', className)}
      {...props}
    />
  );
}

export function SidebarInput({
  className,
  ...props
}: ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      className={cn('h-8 w-full bg-background shadow-none', className)}
      {...props}
    />
  );
}

export function SidebarMenu({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn('flex w-full min-w-0 flex-col gap-1', className)}
      {...props}
    />
  );
}

export function SidebarMenuItem({ className, ...props }: ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-item"
      className={cn('group/menu-item relative', className)}
      {...props}
    />
  );
}

// On a phone the open sidebar covers the page, so following a link shuts
// it. A button that isn't a link, such as a menu's trigger, leaves it open.
function useShutOnPhone<Element>(
  link: boolean,
  onClick: ((event: MouseEvent<Element>) => void) | undefined,
) {
  const { isMobile, setOpen } = useFrame();
  return (event: MouseEvent<Element>) => {
    onClick?.(event);
    if (link && isMobile) setOpen(false);
  };
}

/**
 * A place in the sidebar. `render` makes it a link, and then a tap on a phone
 * also shuts the sidebar. A finger's size on a phone, compact on a wide screen.
 */
export function SidebarMenuButton({
  render,
  isActive = false,
  size = 'default',
  className,
  onClick,
  ...props
}: useRender.ComponentProps<'button'> &
  ComponentProps<'button'> & {
    readonly isActive?: boolean;
    readonly size?: 'default' | 'lg';
  }) {
  const shutOnPhone = useShutOnPhone(render !== undefined, onClick);
  return useRender({
    defaultTagName: 'button',
    props: mergeProps<'button'>(
      {
        className: cn(
          'peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-inset active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate',
          size === 'lg' ? 'h-12' : 'h-11 md:h-8',
          className,
        ),
        onClick: shutOnPhone,
      },
      props,
    ),
    render,
    state: { slot: 'sidebar-menu-button', size, active: isActive },
  });
}

/** A loading placeholder the shape of a menu button. */
export function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: ComponentProps<'div'> & { readonly showIcon?: boolean }) {
  // Random width between 50 to 90%.
  const [width] = useState(() => `${Math.floor(Math.random() * 40) + 50}%`);
  return (
    <div
      data-slot="sidebar-menu-skeleton"
      className={cn('flex h-8 items-center gap-2 rounded-md px-2', className)}
      {...props}
    >
      {showIcon ? <Skeleton className="size-4 rounded-md" /> : null}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        style={{ '--skeleton-width': width } as CSSProperties}
      />
    </div>
  );
}

/** Places nested under a menu button, along a line. */
export function SidebarMenuSub({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      className={cn(
        'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5',
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenuSubItem({
  className,
  ...props
}: ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      className={cn('group/menu-sub-item relative', className)}
      {...props}
    />
  );
}

/** A nested place, a link: a tap on a phone shuts the sidebar. */
export function SidebarMenuSubButton({
  render,
  isActive = false,
  className,
  onClick,
  ...props
}: useRender.ComponentProps<'a'> &
  ComponentProps<'a'> & { readonly isActive?: boolean }) {
  const shutOnPhone = useShutOnPhone(true, onClick);
  return useRender({
    defaultTagName: 'a',
    props: mergeProps<'a'>(
      {
        className: cn(
          'flex h-9 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sm text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-inset active:bg-sidebar-accent active:text-sidebar-accent-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground md:h-7 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
          className,
        ),
        onClick: shutOnPhone,
      },
      props,
    ),
    render,
    state: { slot: 'sidebar-menu-sub-button', active: isActive },
  });
}

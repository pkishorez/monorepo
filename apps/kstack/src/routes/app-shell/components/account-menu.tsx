import {
  Avatar,
  AvatarFallback,
} from '@kstackz/ui-toolkit/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kstackz/ui-toolkit/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useAppShell,
} from '@kstackz/ui-toolkit/components/blocks/app-shell';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  ChevronsUpDownIcon,
  LogInIcon,
  UserIcon,
} from '@kstackz/ui-toolkit/lucide';
import { appTheme } from '../../../common/theme.ts';

const GuestAvatar = () => (
  <Avatar className="rounded-lg">
    <AvatarFallback className="rounded-lg">
      <UserIcon aria-hidden="true" className="size-4" />
    </AvatarFallback>
  </Avatar>
);

/**
 * Who is signed in, and everything that belongs to them: the theme, and
 * signing in or out. It lives at the foot of the sidebar, or, in an app
 * without one, at the header's right, as just the avatar.
 */
export function AccountMenu(props: { readonly place: 'sidebar' | 'header' }) {
  return props.place === 'header' ? (
    <HeaderAccountMenu />
  ) : (
    <SidebarAccountMenu />
  );
}

// Just the avatar. It can sit outside the App Shell, floating when there's no header.
function HeaderAccountMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Account"
            className="size-11 rounded-full md:size-8"
          />
        }
      >
        <GuestAvatar />
      </DropdownMenuTrigger>
      <AccountItems side="bottom" />
    </DropdownMenu>
  );
}

function SidebarAccountMenu() {
  const { isMobile } = useAppShell();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            <GuestAvatar />
            <span className="grid flex-1 text-left leading-tight">
              <span className="truncate font-medium">Guest</span>
              <span className="truncate text-xs text-muted-foreground">
                Not signed in
              </span>
            </span>
            <ChevronsUpDownIcon aria-hidden="true" className="ml-auto" />
          </DropdownMenuTrigger>
          <AccountItems side={isMobile ? 'top' : 'right'} />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function AccountItems(props: { readonly side: 'top' | 'right' | 'bottom' }) {
  const { theme, setTheme } = appTheme.useTheme();
  return (
    <DropdownMenuContent
      side={props.side}
      align="end"
      sideOffset={4}
      className="w-56"
    >
      <DropdownMenuGroup>
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) =>
            setTheme(value === 'light' ? 'light' : 'dark')
          }
        >
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      {/* No auth in this Example: sign-in has its place, not its flow. */}
      <DropdownMenuItem disabled>
        <LogInIcon aria-hidden="true" />
        Sign in
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

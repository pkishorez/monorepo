import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@monorepo/frontend/components/ui/button';
import { Badge } from '@monorepo/frontend/components/ui/badge';
import { Input } from '@monorepo/frontend/components/ui/input';
import { Textarea } from '@monorepo/frontend/components/ui/textarea';
import { Label } from '@monorepo/frontend/components/ui/label';
import { Slider } from '@monorepo/frontend/components/ui/slider';
import { Separator } from '@monorepo/frontend/components/ui/separator';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@monorepo/frontend/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monorepo/frontend/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@monorepo/frontend/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@monorepo/frontend/components/ui/accordion';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@monorepo/frontend/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@monorepo/frontend/components/ui/alert-dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@monorepo/frontend/components/ui/breadcrumb';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@monorepo/frontend/components/ui/collapsible';
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@monorepo/frontend/components/ui/combobox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@monorepo/frontend/components/ui/dropdown-menu';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@monorepo/frontend/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@monorepo/frontend/components/ui/input-group';
import { ScrollArea } from '@monorepo/frontend/components/ui/scroll-area';
import {
  LucideMail,
  LucideLoader2,
  LucideDownload,
  ArrowLeft,
  SunIcon,
  ChevronsUpDown,
  LucideUser,
  LucideSettings,
  LucideLogOut,
  LucideSearch,
} from '@monorepo/frontend/lucide';
import { useTheme } from '@/components/theme';

export const Route = createFileRoute('/dev/ui')({
  component: ComponentsPage,
});

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 bg-muted/30">
        <h2 className="text-sm font-medium text-foreground/80">{title}</h2>
      </div>
      <div className="p-4 space-y-6">{children}</div>
    </section>
  );
}

function Demo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function ComponentsPage() {
  const [sliderValue, setSliderValue] = useState([50]);
  const { toggleTheme } = useTheme();

  return (
    <div className="min-h-dvh">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
        <div className="max-w-2xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dev">
              <Button variant="ghost" size="icon-sm">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-foreground/90">
                UI Components
              </h1>
              <p className="text-muted-foreground text-xs">
                @monorepo/frontend
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={toggleTheme}>
            <SunIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-8">
        <div className="space-y-6">
          {/* Button */}
          <Section title="Button">
            <Demo label="Variants">
              <Button variant="default">Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </Demo>
            <Demo label="Sizes">
              <Button size="xs">Extra Small</Button>
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
            </Demo>
            <Demo label="Icon buttons">
              <Button size="icon-xs" variant="outline">
                <LucideMail />
              </Button>
              <Button size="icon-sm" variant="outline">
                <LucideMail />
              </Button>
              <Button size="icon" variant="outline">
                <LucideMail />
              </Button>
              <Button size="icon-lg" variant="outline">
                <LucideMail />
              </Button>
            </Demo>
            <Demo label="With icons">
              <Button>
                <LucideMail data-icon="inline-start" />
                Email
              </Button>
              <Button variant="outline">
                <LucideDownload data-icon="inline-start" />
                Download
              </Button>
            </Demo>
            <Demo label="Loading / Disabled">
              <Button disabled>
                <LucideLoader2
                  className="animate-spin"
                  data-icon="inline-start"
                />
                Loading
              </Button>
              <Button disabled>Disabled</Button>
            </Demo>
          </Section>

          {/* Badge */}
          <Section title="Badge">
            <Demo label="Variants">
              <Badge variant="default">Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
            </Demo>
          </Section>

          {/* Input */}
          <Section title="Input">
            <Demo label="Default">
              <Input placeholder="Enter text..." className="max-w-xs" />
            </Demo>
            <Demo label="With label">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  className="max-w-xs"
                />
              </div>
            </Demo>
            <Demo label="Disabled">
              <Input disabled placeholder="Disabled" className="max-w-xs" />
            </Demo>
          </Section>

          {/* Textarea */}
          <Section title="Textarea">
            <Demo label="Default">
              <Textarea
                placeholder="Enter your message..."
                className="max-w-sm"
              />
            </Demo>
          </Section>

          {/* Select */}
          <Section title="Select">
            <Demo label="Default">
              <Select defaultValue="apple">
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select a fruit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="apple">Apple</SelectItem>
                  <SelectItem value="banana">Banana</SelectItem>
                  <SelectItem value="orange">Orange</SelectItem>
                  <SelectItem value="grape">Grape</SelectItem>
                </SelectContent>
              </Select>
            </Demo>
            <Demo label="Small">
              <Select>
                <SelectTrigger size="sm" className="w-48">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a">Option A</SelectItem>
                  <SelectItem value="b">Option B</SelectItem>
                </SelectContent>
              </Select>
            </Demo>
          </Section>

          {/* Slider */}
          <Section title="Slider">
            <Demo label="Default">
              <div className="w-64">
                <Slider
                  value={sliderValue}
                  onValueChange={(value) => setSliderValue(value as number[])}
                  max={100}
                  step={1}
                />
                <div className="text-sm text-muted-foreground mt-2">
                  Value: {sliderValue[0]}
                </div>
              </div>
            </Demo>
          </Section>

          {/* Card */}
          <Section title="Card">
            <Demo label="Default">
              <Card className="max-w-sm">
                <CardHeader>
                  <CardTitle>Card Title</CardTitle>
                  <CardDescription>Card description goes here.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>Card content with some example text.</p>
                </CardContent>
                <CardFooter>
                  <Button size="sm">Action</Button>
                </CardFooter>
              </Card>
            </Demo>
            <Demo label="Small size">
              <Card size="sm" className="max-w-sm">
                <CardHeader>
                  <CardTitle>Compact</CardTitle>
                  <CardDescription>Smaller padding</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>Content here.</p>
                </CardContent>
              </Card>
            </Demo>
          </Section>

          {/* Dialog */}
          <Section title="Dialog">
            <Demo label="Default">
              <Dialog>
                <DialogTrigger render={<Button variant="outline" />}>
                  Open Dialog
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Dialog Title</DialogTitle>
                    <DialogDescription>
                      This is a dialog description. You can put any content
                      here.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">Dialog content goes here.</div>
                  <DialogFooter showCloseButton>
                    <Button>Confirm</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </Demo>
          </Section>

          {/* Accordion */}
          <Section title="Accordion">
            <Demo label="Default">
              <Accordion className="w-full max-w-md">
                <AccordionItem value="item-1">
                  <AccordionTrigger>Is it accessible?</AccordionTrigger>
                  <AccordionContent>
                    Yes. It adheres to the WAI-ARIA design pattern.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>Is it styled?</AccordionTrigger>
                  <AccordionContent>
                    Yes. It comes with default styles that match your theme.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-3">
                  <AccordionTrigger>Is it animated?</AccordionTrigger>
                  <AccordionContent>
                    Yes. It has smooth open/close animations.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </Demo>
          </Section>

          {/* Tooltip */}
          <Section title="Tooltip">
            <Demo label="Positions">
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline" />}>
                  Top
                </TooltipTrigger>
                <TooltipContent side="top">Tooltip on top</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline" />}>
                  Bottom
                </TooltipTrigger>
                <TooltipContent side="bottom">Tooltip on bottom</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline" />}>
                  Left
                </TooltipTrigger>
                <TooltipContent side="left">Tooltip on left</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline" />}>
                  Right
                </TooltipTrigger>
                <TooltipContent side="right">Tooltip on right</TooltipContent>
              </Tooltip>
            </Demo>
          </Section>

          {/* Separator */}
          <Section title="Separator">
            <Demo label="Horizontal">
              <div className="w-full max-w-md">
                <div className="text-sm">Above</div>
                <Separator className="my-4" />
                <div className="text-sm">Below</div>
              </div>
            </Demo>
          </Section>

          {/* Label */}
          <Section title="Label">
            <Demo label="Default">
              <Label>Form Label</Label>
            </Demo>
            <Demo label="With input">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="Enter username"
                  className="max-w-xs"
                />
              </div>
            </Demo>
          </Section>

          {/* Alert Dialog */}
          <Section title="Alert Dialog">
            <Demo label="Default">
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="destructive" />}>
                  Delete Account
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete
                      your account and remove your data from our servers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Demo>
          </Section>

          {/* Breadcrumb */}
          <Section title="Breadcrumb">
            <Demo label="Default">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="#">Home</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink href="#">Components</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Breadcrumb</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </Demo>
          </Section>

          {/* Collapsible */}
          <Section title="Collapsible">
            <Demo label="Default">
              <Collapsible className="w-full max-w-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium">Toggle content</span>
                  <CollapsibleTrigger
                    render={<Button variant="outline" size="sm" />}
                  >
                    <ChevronsUpDown className="size-4" />
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="mt-2">
                  <div className="rounded-md border border-border/40 p-4 text-sm">
                    This is the collapsible content. It can contain anything.
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Demo>
          </Section>

          {/* Combobox */}
          <Section title="Combobox">
            <Demo label="Default">
              <Combobox>
                <ComboboxInput
                  placeholder="Search fruits..."
                  className="w-48"
                />
                <ComboboxContent>
                  <ComboboxList>
                    <ComboboxItem value="apple">Apple</ComboboxItem>
                    <ComboboxItem value="banana">Banana</ComboboxItem>
                    <ComboboxItem value="orange">Orange</ComboboxItem>
                    <ComboboxItem value="grape">Grape</ComboboxItem>
                    <ComboboxItem value="mango">Mango</ComboboxItem>
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </Demo>
          </Section>

          {/* Dropdown Menu */}
          <Section title="Dropdown Menu">
            <Demo label="Default">
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" />}>
                  Open Menu
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <LucideUser className="size-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <LucideSettings className="size-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive">
                    <LucideLogOut className="size-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Demo>
          </Section>

          {/* Field */}
          <Section title="Field">
            <Demo label="With description and error">
              <Field className="max-w-sm">
                <FieldLabel htmlFor="email-field">Email</FieldLabel>
                <Input id="email-field" placeholder="name@example.com" />
                <FieldDescription>
                  We'll never share your email.
                </FieldDescription>
              </Field>
            </Demo>
            <Demo label="With error">
              <Field className="max-w-sm">
                <FieldLabel htmlFor="email-error">Email</FieldLabel>
                <Input
                  id="email-error"
                  placeholder="name@example.com"
                  aria-invalid="true"
                />
                <FieldError>Please enter a valid email address.</FieldError>
              </Field>
            </Demo>
          </Section>

          {/* Input Group */}
          <Section title="Input Group">
            <Demo label="With icon">
              <InputGroup className="max-w-xs">
                <InputGroupAddon>
                  <LucideSearch className="size-4" />
                </InputGroupAddon>
                <InputGroupInput placeholder="Search..." />
              </InputGroup>
            </Demo>
            <Demo label="With text addon">
              <InputGroup className="max-w-xs">
                <InputGroupAddon>https://</InputGroupAddon>
                <InputGroupInput placeholder="example.com" />
              </InputGroup>
            </Demo>
          </Section>

          {/* Scroll Area */}
          <Section title="Scroll Area">
            <Demo label="Default">
              <ScrollArea className="h-48 w-64 rounded-md border border-border/40 p-4">
                <div className="space-y-4">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} className="text-sm">
                      Item {i + 1} - Scrollable content
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Demo>
          </Section>
        </div>
      </div>
    </div>
  );
}

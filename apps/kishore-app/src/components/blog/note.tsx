import { cn } from '@monorepo/frontend/utils';
import {
  Info,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
} from '@monorepo/frontend/lucide';
import { ReactNode } from 'react';

type NoteType = 'info' | 'warning' | 'danger' | 'success';

interface NoteProps {
  type?: NoteType;
  title?: string;
  children: ReactNode;
  className?: string;
}

const noteConfig = {
  info: {
    icon: Info,
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800/50',
    iconColor: 'text-blue-600 dark:text-blue-400',
    titleColor: 'text-blue-900 dark:text-blue-300',
    contentColor: 'text-blue-800 dark:text-blue-200',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800/50',
    iconColor: 'text-amber-600 dark:text-amber-400',
    titleColor: 'text-amber-900 dark:text-amber-300',
    contentColor: 'text-amber-800 dark:text-amber-200',
  },
  danger: {
    icon: AlertCircle,
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-200 dark:border-red-800/50',
    iconColor: 'text-red-600 dark:text-red-400',
    titleColor: 'text-red-900 dark:text-red-300',
    contentColor: 'text-red-800 dark:text-red-200',
  },
  success: {
    icon: CheckCircle,
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-green-200 dark:border-green-800/50',
    iconColor: 'text-green-600 dark:text-green-400',
    titleColor: 'text-green-900 dark:text-green-300',
    contentColor: 'text-green-800 dark:text-green-200',
  },
} as const;

export function Note({ type = 'info', title, children, className }: NoteProps) {
  const config = noteConfig[type];
  const IconComponent = config.icon;

  return (
    <div
      className={cn(
        'my-6 not-prose rounded-lg border p-4',
        config.bgColor,
        config.borderColor,
        className,
      )}
    >
      <div className="flex gap-3">
        <IconComponent
          className={cn('h-5 w-5 shrink-0 mt-0.5', config.iconColor)}
        />
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className={cn('font-medium text-sm mb-2', config.titleColor)}>
              {title}
            </h4>
          )}
          <div
            className={cn(
              'text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
              config.contentColor,
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

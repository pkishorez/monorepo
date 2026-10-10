import type { ReactNode } from 'react';
import { FileText, Paperclip } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kstackz/web-platform/components/alert';
import { Button } from '@kstackz/web-platform/components/button';
import { employmentRange, pluralize, stepLabel } from '../application/index.js';
import type { Sheet, Step } from '../application/index.js';

/*
 * The last step: everything answered, read from the application's Sheet,
 * and the Submit button. It has nothing of its own to keep, so it is a
 * drawing in the application's View, not an Actor.
 */

type Submission = 'NotSubmitted' | 'Submitting' | 'Submitted';

const Section = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) => (
  <section className="rounded-lg border p-4">
    <h3 className="mb-2 text-sm font-semibold">{title}</h3>
    {children}
  </section>
);

const Row = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) =>
  value === '' ? null : (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  );

const None = ({ children }: { readonly children: ReactNode }) => (
  <p className="text-sm text-muted-foreground italic">{children}</p>
);

export const Review = ({
  sheet,
  submission,
  blocked,
  onSubmit,
}: {
  readonly sheet: Sheet;
  readonly submission: Submission;
  /** Steps that stop the submit, once Submit was pressed; null before. */
  readonly blocked: ReadonlyArray<Step> | null;
  readonly onSubmit: () => void;
}) => {
  const info = sheet.PersonalInfo;
  const { entries: positions } = sheet.WorkHistory;
  const { entries: skills } = sheet.Skills;
  const { resume, others } = sheet.Attachments;
  return (
    <div className="flex flex-col gap-4">
      <Section title="Personal Information">
        <div className="divide-y">
          <Row label="Name" value={info.name} />
          <Row label="Email" value={info.email} />
          <Row label="Phone" value={info.phone} />
          <Row label="Pronouns" value={info.pronouns} />
          <Row label="Portfolio" value={info.portfolioUrl} />
          <Row label="Available from" value={info.availableDate} />
        </div>
      </Section>
      <Section
        title={`Work History (${pluralize(positions.length, 'position', 'positions')})`}
      >
        {positions.map((entry) => (
          <div key={entry.id} className="py-1">
            <strong className="text-sm">
              {entry.company
                ? `${entry.title} at ${entry.company}`
                : entry.title}
            </strong>
            {entry.start && (
              <p className="text-xs text-muted-foreground">
                {employmentRange(entry)}
              </p>
            )}
          </div>
        ))}
      </Section>
      <Section title={`Skills (${skills.length})`}>
        <div className="flex flex-wrap gap-1.5">
          {skills
            .filter((skill) => skill.name !== '')
            .map((skill) => (
              <span
                key={skill.id}
                className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                {skill.name}
              </span>
            ))}
        </div>
      </Section>
      <Section title="Cover Letter">
        {sheet.CoverLetter.content ? (
          <p className="text-sm whitespace-pre-wrap">
            {sheet.CoverLetter.content}
          </p>
        ) : (
          <None>No cover letter provided</None>
        )}
      </Section>
      <Section title="Attachments">
        <div className="flex flex-col gap-1 text-sm">
          {resume ? (
            <span className="flex items-center gap-2">
              <FileText className="size-4" /> {resume.name}
            </span>
          ) : (
            <None>No resume uploaded</None>
          )}
          {others.map((file, index) => (
            <span
              key={`${index}-${file.name}`}
              className="flex items-center gap-2"
            >
              <Paperclip className="size-4" /> {file.name}
            </span>
          ))}
        </div>
      </Section>
      {submission === 'Submitted' ? (
        <Alert role="status">
          <AlertTitle>Application Submitted!</AlertTitle>
          <AlertDescription>
            Thank you for applying to work on Effect Oak. We'll be in touch!
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col gap-2 pt-2">
          {blocked && (
            <p className="text-center text-sm text-destructive">
              {blocked.length === 0
                ? 'Review the required fields before submitting.'
                : `Review ${blocked.map((step) => stepLabel[step]).join(', ')} before submitting.`}
            </p>
          )}
          <Button
            size="lg"
            disabled={submission === 'Submitting'}
            onClick={onSubmit}
          >
            {submission === 'Submitting' ? 'Submitting…' : 'Submit Application'}
          </Button>
        </div>
      )}
    </div>
  );
};

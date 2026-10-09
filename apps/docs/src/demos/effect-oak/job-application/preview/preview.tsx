import type { ReactNode } from 'react';
import { employmentRange } from '../application/index.js';
import type { Sheet } from '../application/index.js';

/*
 * The live resume, drawn from the application's Sheet: the copy of every
 * step's answers the steps keep reporting. In Foldkit the preview reads the
 * step Submodels straight out of the one Model.
 */

const COVER_LETTER_PREVIEW_CHARS = 200;
const LEVEL_ORDER = ['Expert', 'Advanced', 'Intermediate', 'Beginner'];

const truncate = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max)}…` : value;

const Section = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) => (
  <section className="mb-4">
    <h3 className="mb-2 border-b pb-1 text-xs font-bold tracking-wider text-muted-foreground uppercase">
      {title}
    </h3>
    {children}
  </section>
);

export const Preview = ({ sheet }: { readonly sheet: Sheet }) => {
  const info = sheet.PersonalInfo;
  const contacts = [info.email, info.phone, info.portfolioUrl].filter(Boolean);
  const positions = sheet.WorkHistory.entries.filter(
    (entry) => entry.company !== '' || entry.title !== '',
  );
  const skills = sheet.Skills.entries.filter((entry) => entry.name !== '');
  const levels = LEVEL_ORDER.map((level) => ({
    level,
    names: skills
      .filter((skill) => skill.proficiency === level)
      .map((skill) => skill.name),
  })).filter((group) => group.names.length > 0);
  const letter = sheet.CoverLetter.content;

  return (
    <div className="font-serif">
      <div className="mb-4 border-b pb-4 text-center">
        <h2 className="text-xl font-bold">{info.name || 'Your Name'}</h2>
        {info.pronouns && (
          <p className="text-xs text-muted-foreground italic">
            {info.pronouns}
          </p>
        )}
        {contacts.length > 0 && (
          <p className="mt-1 text-xs break-words text-muted-foreground">
            {contacts.join(' · ')}
          </p>
        )}
      </div>
      {positions.length > 0 && (
        <Section title="Experience">
          {positions.map((entry) => (
            <div key={entry.id} className="mb-3">
              {entry.title && (
                <strong className="block text-sm">{entry.title}</strong>
              )}
              {entry.company && (
                <p className="text-xs text-muted-foreground">{entry.company}</p>
              )}
              {entry.start && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {employmentRange(entry)}
                </p>
              )}
              {entry.description && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.description}
                </p>
              )}
            </div>
          ))}
        </Section>
      )}
      {levels.length > 0 && (
        <Section title="Skills">
          {levels.map(({ level, names }) => (
            <p key={level} className="mb-1 text-xs">
              <strong>{level}:</strong> {names.join(', ')}
            </p>
          ))}
        </Section>
      )}
      {letter && (
        <Section title="Cover Letter">
          <p className="text-xs whitespace-pre-wrap text-muted-foreground">
            {truncate(letter, COVER_LETTER_PREVIEW_CHARS)}
          </p>
        </Section>
      )}
    </div>
  );
};

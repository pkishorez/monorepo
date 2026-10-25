import type { Attachment } from '../../contract/index.js';
import type { SkillMetadata, UserInput } from '../app-server/index.js';

/** `/name` as its own word: at the start, or after whitespace. */
const SKILL_TOKEN = /(^|\s)\/([A-Za-z0-9][\w.:-]*)(?=\s|$)/g;

/** Whether the text may name a Skill, so the Skill list is worth reading. */
export const mayNameSkill = (text: string): boolean =>
  new RegExp(SKILL_TOKEN.source).test(text);

/**
 * One user message as Codex input. Every `/name` naming a known Skill
 * becomes Codex's own `$name` in the text plus a `skill` item, so Codex
 * loads the Skill; any other `/word` stays as typed. Images go inline as
 * data URLs.
 */
export const toUserInput = (
  message: {
    readonly text: string;
    readonly images: ReadonlyArray<Attachment>;
  },
  skills: ReadonlyArray<SkillMetadata>,
): ReadonlyArray<UserInput> => {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const named = new Map<string, SkillMetadata>();
  const text = message.text.replace(
    SKILL_TOKEN,
    (token, before: string, name: string) => {
      const skill = byName.get(name);
      if (skill === undefined) return token;
      named.set(name, skill);
      return `${before}$${name}`;
    },
  );
  return [
    { type: 'text', text, text_elements: [] },
    ...message.images.map((image): UserInput => ({
      type: 'image',
      url: `data:${image.mime};base64,${image.data}`,
    })),
    ...[...named.values()].map((skill): UserInput => ({
      type: 'skill',
      name: skill.name,
      path: skill.path,
    })),
  ];
};

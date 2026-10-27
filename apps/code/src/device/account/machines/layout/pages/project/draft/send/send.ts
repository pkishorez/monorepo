import type { Model, Props } from '../actor.ts';
import { ask, send, startSession } from './commands.ts';
import { wire } from '../draft.ts';
import { pickedHarness, pickedModel, pickedSettings } from '../pick/pick.ts';

/*
 * What a mode's text handed up becomes, by where the Draft goes: a new
 * session started with it, a Side Question asked, or a Session's next
 * Message sent, its files with it. Each gives the Draft as it is after,
 * and the Command, or nothing when there is nothing to send now.
 */

/** A new session, already running its first message. */
export const start = (model: Model, props: Props, written: string) => {
  const text = written.trim();
  const harness = pickedHarness(model);
  const picked = pickedModel(model);
  if (model.starting || harness === null || picked === null) return {};
  if (!harness.available)
    return {
      model: {
        ...model,
        problem:
          harness.unavailableReason ?? 'This agent cannot run on this machine',
      },
    };
  if (text === '' && model.attachments.length === 0)
    return { model: { ...model, problem: 'Write the first message' } };
  return {
    model: { ...model, starting: true, problem: null },
    command: startSession({
      projectId: props.projectId,
      account: harness.account,
      model: picked,
      settings: pickedSettings(model),
      text,
      attachments: wire(model.attachments),
    }),
  };
};

/** A Side Question, replacing the last. */
export const askOf = (model: Model, sessionId: string, text: string) => {
  const question = text.trim();
  if (question === '') return {};
  const id = model.asks + 1;
  return {
    model: {
      ...model,
      problem: null,
      asked: { id, question, answer: null, problem: null },
      asks: id,
    },
    command: ask({ id, sessionId, question }),
  };
};

/** A Session's Message, its files emptied from the Draft with it. */
export const sendTo = (model: Model, sessionId: string, written: string) => {
  const text = written.trim();
  if (text === '' && model.attachments.length === 0) return {};
  const { chosen } = model;
  return {
    model: { ...model, attachments: [], problem: null },
    command: send({
      sessionId,
      text,
      attachments: model.attachments,
      ...(chosen.model === null ? {} : { model: chosen.model }),
      ...(Object.keys(chosen.settings).length === 0
        ? {}
        : { settings: chosen.settings }),
    }),
  };
};

import { Option, Schema } from 'effect';
import type { Message } from '../../../../../../../../../services/agent/contract/index.js';
import { Answer, IDLE } from '../index.js';
import type { Turn } from '../index.js';
import { questionOf } from './prompt.js';

const ACTIVITY = 12;

const answerOf = (data: unknown) =>
  Option.getOrNull(Schema.decodeUnknownOption(Answer)(data));

export const turnsOf = (messages: ReadonlyArray<Message>) => {
  const turns: Array<Turn> = [];
  let run = IDLE;
  for (const message of messages) {
    switch (message._tag) {
      case 'User':
        turns.push({ ...questionOf(message.text), answer: null, text: null });
        run = { ...IDLE, status: 'running', since: message.at };
        break;
      case 'Assistant': {
        const last = turns.pop();
        if (last)
          turns.push({
            ...last,
            answer: answerOf(message.data),
            text: message.text ?? null,
          });
        break;
      }
      case 'Activity':
        run = {
          ...run,
          activity: [...run.activity, message.text].slice(-ACTIVITY),
        };
        break;
      case 'Status':
        run = {
          ...run,
          status: message.status,
          reason: message.reason ?? null,
          since: message.status === 'running' ? message.at : run.since,
        };
    }
  }
  return { turns, run };
};

export const titleOf = (turns: ReadonlyArray<Turn>) =>
  turns.find(({ answer }) => answer !== null)?.answer?.title ??
  turns[0]?.question ??
  '';

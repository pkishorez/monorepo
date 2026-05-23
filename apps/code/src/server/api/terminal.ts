import { Rpc, RpcGroup } from '@effect/rpc';
import { Schema } from 'effect';
import {
  CreateTerminalRequest,
  TerminalCreated,
  TerminalInfo,
  TerminalIdRequest,
  TerminalSnapshot,
  WriteTerminalRequest,
  ResizeTerminalRequest,
  TerminalSpawnError,
  TerminalNotFoundError,
} from '../../domain/terminal/index.js';

const createTerminal = Rpc.make('createTerminal', {
  payload: CreateTerminalRequest,
  success: TerminalCreated,
  error: TerminalSpawnError,
});

const listTerminals = Rpc.make('listTerminals', {
  success: Schema.Array(TerminalInfo),
});

const getTerminalSnapshot = Rpc.make('getTerminalSnapshot', {
  payload: TerminalIdRequest,
  success: TerminalSnapshot,
  error: TerminalNotFoundError,
});

const streamTerminal = Rpc.make('streamTerminal', {
  payload: TerminalIdRequest,
  success: Schema.String,
  error: TerminalNotFoundError,
  stream: true,
});

const writeToTerminal = Rpc.make('writeToTerminal', {
  payload: WriteTerminalRequest,
  error: TerminalNotFoundError,
});

const resizeTerminal = Rpc.make('resizeTerminal', {
  payload: ResizeTerminalRequest,
  error: TerminalNotFoundError,
});

const killTerminal = Rpc.make('killTerminal', {
  payload: TerminalIdRequest,
  error: TerminalNotFoundError,
});

export const TerminalRpcs = RpcGroup.make(
  createTerminal,
  listTerminals,
  getTerminalSnapshot,
  streamTerminal,
  writeToTerminal,
  resizeTerminal,
  killTerminal,
);

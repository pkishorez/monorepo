import { CodeRpcError } from '../../contract/index.js';
import type { CodeError } from '../../orchestrators/index.js';

export const toRpcError = (error: CodeError) =>
  new CodeRpcError({ code: error.code, message: error.message });

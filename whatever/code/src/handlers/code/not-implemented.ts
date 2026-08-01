import { CodeRpcError } from '../../contract/code/index.js';

export const codeNotImplemented = () =>
  new CodeRpcError({
    code: 'not_implemented',
    message: 'Coding-agent execution is not implemented yet',
  });

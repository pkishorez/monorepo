import { format } from '../logic/shared/index.ts';
import { shape } from '../logic/index.ts'; // ✗ imports
import { help } from './helper.ts';
import { outline } from './outline/index.ts';
export const body = [format, shape, help, outline];
import { AllRpc } from '../../server/rpc/contract/index.ts';
import { toWire } from '../../server/rpc/feature/contract/index.ts';
import { handlers } from '../../server/rpc/feature/real/index.ts'; // ✗ imports
import { OtlpApi } from '../../server/http/otlp/contract/index.ts'; // ✗ imports
export const wire = [AllRpc, toWire, handlers, OtlpApi];

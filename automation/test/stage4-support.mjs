// Small re-exports for Stage 4 tests.
export { resolveTaxonomy, makeSanitizer } from '../src/stage4/index.mjs';
import { unzipSync } from '../../production/src/lib.mjs';
export const unzip=bytes=>unzipSync(new Uint8Array(bytes));

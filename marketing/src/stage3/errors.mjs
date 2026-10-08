// Stage 3 errors (own module so the facts core and the product adapters can
// both use it without an import cycle).
export class Stage3Error extends Error{constructor(m){super(m);this.name='Stage3Error';this.retryable=false;}}

// Production errors are deterministic: retrying without a change gives the
// same result, so they are marked not retryable.
export class HandoffError extends Error{constructor(m){super(m);this.name='HandoffError';this.retryable=false;}}
export class ProductionQcError extends Error{
  constructor(failed){super(`production QC failed: ${failed.map(c=>`${c.name}: ${c.detail}`).join('; ')}`);this.name='ProductionQcError';this.retryable=false;this.failed=failed;}
}

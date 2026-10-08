// The ONE GBP price contract (listing `suggested_price_gbp`, Stage 4 Etsy price).
// Deterministic, no I/O. A price is a JSON NUMBER of pounds, 0.50 to 100.00,
// with at most 2 decimal places. It is never a string: "£4.99", "4.99-6.99",
// "around £5" and null are rejected, never parsed or guessed.
//
// Precision is checked in whole pence with a float-safe tolerance. A direct
// `Math.round(p*100)===p*100` is wrong in binary floating point: 8.95*100 is
// 894.9999999999999, so it rejected 1,142 of the 9,951 valid prices from 0.50
// to 100.00. A value with a third decimal (7.495) is still rejected; it is
// never rounded, so the model never chooses a price that code then changes.
// Note: JSON cannot tell 12 from 12.00 (both parse to the number 12), so a
// whole-pound price is the valid price £12.00.

export const PRICE_GBP=Object.freeze({min:0.5,max:100,decimals:2});
// Far below one penny, far above float error at these magnitudes (~1e-12).
const EPS=1e-6;

/** Whole pence of a GBP number with at most 2 decimals, else null (not a finite number, or a sub-penny part). */
export function pence(v){
  if(typeof v!=='number'||!Number.isFinite(v))return null;
  const c=v*100, r=Math.round(c);
  return Math.abs(c-r)<EPS?r:null;
}

/** Why `v` is not a valid GBP price under the contract (min/max in pounds), or null. The message shows the value received. */
export function priceProblem(v,{min=PRICE_GBP.min,max=PRICE_GBP.max}={}){
  const got=v===undefined?'nothing':JSON.stringify(v);
  const c=pence(v), range=`£${min.toFixed(2)} to £${max.toFixed(2)}`;
  if(typeof v!=='number')return `got ${got} (${v===null?'null':typeof v}); must be a number of pounds from ${range} with at most 2 decimals`;
  if(c===null)return `got ${got}; must have at most 2 decimals`;
  if(c<Math.round(min*100)||c>Math.round(max*100))return `got ${got}; must be from ${range}`;
  return null;
}

/** The canonical number for a valid price (8.950000000000001 -> 8.95): a lossless float clean-up, never a rounding of a sub-penny value. */
export const canonicalPrice=v=>{const c=pence(v);return c===null?v:c/100;};

// Stage 2 adapters, one per product format. An adapter maps the approved
// pages to roles, lists review notes, and plans the customer files. Add a
// format here only when its production is implemented; the contract every
// adapter must meet is checked by test/adapter-contract.test.mjs.
//
// Contract: { format, version, manifest(draft, plan, {artwork}) -> object|Promise,
//   reviewNotes(draft, manifest) -> string[], plan(handoff, {imageEncoding, artwork}) -> plan|Promise,
//   qcChecks(ctx) -> checks[] | {checks, previews} | Promise }
// Optional: encodingLadder (default: build.ENCODING_LADDER), packaging {split} (default: one ZIP),
//   stage3Metadata(handoff, plan) -> object recorded in the build record for Stage 3,
//   artwork: 'full-book' when every page must come from an owner-approved Stage 1 full book
//   (default: the approved style-proof assets),
//   content: 'crochet-patterns' when the product also needs its owner-approved pattern source
//   (APPROVE PATTERNS, bound by SHA-256; ADR-041),
//   record: extra build-record fields returned by plan() as plan.record.
import { greetingCard } from './greeting-card.mjs';
import { colouringBook } from './colouring-book.mjs';
import { crochetPatternBundleMoonlit } from './crochet-pattern-bundle.mjs';
import { HandoffError } from '../errors.mjs';

// Crochet: the Moonlit Meadow document design (v2, ADR-056), approved by the owner 2026-10-06.
export const ADAPTERS=Object.freeze({[greetingCard.format]:greetingCard,[colouringBook.format]:colouringBook,[crochetPatternBundleMoonlit.format]:crochetPatternBundleMoonlit});
export function adapterFor(format){
  const a=ADAPTERS[format];
  if(!a)throw new HandoffError(`No Stage 2 production adapter for "${format}" yet (available: ${Object.keys(ADAPTERS).join(', ')}).`);
  return a;
}

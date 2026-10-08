import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
export const PRODUCT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = resolve(PRODUCT_ROOT, '../..');
// Earlier proof sets are frozen evidence. This renderer writes only the current review.
export const REVIEW_ROOT = resolve(REPO_ROOT,'storage/products/003/prompt-03-review');
export function contained(root, ...parts) {
  const target = resolve(root, ...parts);
  const rel = relative(root, target);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Path escapes Product 3 root');
  return target;
}
export const outputPath = (...parts) => contained(REVIEW_ROOT, ...parts);

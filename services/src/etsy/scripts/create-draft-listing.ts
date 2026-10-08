/**
 * Create ONE Etsy DRAFT listing for a product from its listing.json, using
 * the shared EtsyService. Draft only — never publishes. Makes real API
 * calls; needs a stored OAuth token (authorize-url + exchange-code first)
 * with the `listings_w` and `shops_r` scopes.
 *
 * Usage (from services/):
 *   npm run etsy:create-draft ../products/001-minimalist-monthly-budget-planner/listing/listing.json
 *   #   add --dry-run to resolve shop + taxonomy and print the plan only
 *
 * Writes storage/products/<id>/etsy-draft.json on success. The Telegram
 * review workflow runs the same `createDraftFromListingSpec` path on APPROVE.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { loadEtsyConfig } from "../../config/env.ts";
import {
  createDraftFromListingSpec,
  type ListingSpec,
} from "../create-draft.ts";
import { EtsyService } from "../etsy-service.ts";
import { FileTokenStore } from "../token-store.ts";
import { EtsyAuthError } from "../errors.ts";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const jsonArg = args.find((a) => !a.startsWith("--"));
if (!jsonArg) {
  console.error("Usage: create-draft-listing.ts <path/to/listing.json> [--dry-run]");
  process.exit(1);
}

const REPO = resolve(import.meta.dirname, "../../../..");
const listingPath = isAbsolute(jsonArg) ? jsonArg : resolve(process.cwd(), jsonArg);
const listing = JSON.parse(await readFile(listingPath, "utf8")) as ListingSpec;

const tokenStore = new FileTokenStore();
if ((await tokenStore.load()) === undefined) {
  console.error(
    "No Etsy OAuth token stored. Run:\n" +
      "  npm run etsy:authorize-url\n" +
      "  ETSY_OAUTH_CODE=... ETSY_OAUTH_CODE_VERIFIER=... npm run etsy:exchange-code",
  );
  process.exit(1);
}

const service = new EtsyService({ config: loadEtsyConfig(), tokenStore });

let result;
try {
  result = await createDraftFromListingSpec(service, listing, {
    repoRoot: REPO,
    dryRun,
    log: (line) => console.log(line),
  });
} catch (err) {
  if (err instanceof EtsyAuthError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

if (result.currencyMismatch) {
  console.warn(
    `  ! listing.json currency ${result.listingCurrency} != shop currency ` +
      `${result.shopCurrency}. Amount ${result.priceAmount.toFixed(2)} sent as-is (no FX).`,
  );
}

if (result.dryRun) {
  console.log(
    `\n--dry-run OK — shop ${result.shopId} (${result.shopCurrency}), ` +
      `price ${result.priceAmount.toFixed(2)} ${result.shopCurrency}, ` +
      `taxonomy ${result.taxonomyId}. ` +
      `${(listing.images ?? []).length} images, ${(listing.files ?? []).length} files would upload.`,
  );
  process.exit(0);
}

console.log(`\ndraft listing ${result.listingId} (state=${result.state})`);
console.log(`  price: ${result.priceAmount.toFixed(2)} ${result.shopCurrency}`);
console.log(`  view:  ${result.url}`);
console.log(`  edit:  ${result.editUrl}`);

const outDir = join(REPO, "storage", "products", String(listing.productId ?? "unknown"));
await mkdir(outDir, { recursive: true });
await writeFile(
  join(outDir, "etsy-draft.json"),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      shopId: result.shopId,
      listingId: result.listingId,
      state: result.state,
      taxonomyId: result.taxonomyId,
      priceAmount: result.priceAmount,
      shopCurrency: result.shopCurrency,
      listingCurrency: result.listingCurrency,
      currencyMismatch: result.currencyMismatch,
      url: result.url,
      editUrl: result.editUrl,
      imagesUploaded: result.imagesUploaded,
      filesUploaded: result.filesUploaded,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
console.log(`\nrecorded -> ${join(outDir, "etsy-draft.json")}`);
console.log(
  "\nNEXT: open the edit URL, review the draft, set a shipping/return " +
    "profile if Etsy asks, then Publish from the Etsy UI.",
);

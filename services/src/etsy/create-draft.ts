/**
 * Turn a product's `listing.json` into ONE real Etsy DRAFT listing, with its
 * images and digital files uploaded. Draft only — never publishes.
 *
 * Extracted from the `etsy:create-draft` CLI so the Telegram review service
 * runs the exact same path on APPROVE. There is no second Etsy client: this
 * takes an {@link IEtsyService} and calls it.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { EtsyAuthError } from "./errors.ts";
import type { IEtsyService } from "./etsy-service.interface.ts";
import type { EtsyListingType, EtsyWhoMade, EtsyWhenMade } from "./types.ts";

export interface ListingImageSpec {
  readonly path: string;
  readonly rank?: number;
  readonly alt?: string;
}

export interface ListingFileSpec {
  readonly path: string;
  readonly name?: string;
  readonly rank?: number;
}

/** The subset of `listing.json` this routine reads. */
export interface ListingSpec {
  readonly productId?: string;
  readonly currency?: string;
  readonly price: number | string;
  readonly quantity?: number;
  readonly whoMade?: EtsyWhoMade;
  readonly whenMade?: EtsyWhenMade;
  readonly listingType?: EtsyListingType;
  readonly title: string;
  readonly description: string;
  readonly tags?: readonly string[];
  readonly materials?: readonly string[];
  readonly taxonomy?: {
    readonly taxonomyId?: number | null;
    readonly resolveKeyword?: string;
  };
  readonly images?: readonly ListingImageSpec[];
  readonly files?: readonly ListingFileSpec[];
}

export interface CreateDraftOptions {
  /** Repo root — relative `listing.json` asset paths resolve against it. */
  readonly repoRoot: string;
  /** Resolve shop + taxonomy and return the plan without writing anything. */
  readonly dryRun?: boolean;
  readonly log?: (line: string) => void;
  /** Injectable for tests; defaults to `fs.readFile`. */
  readonly readFileImpl?: (path: string) => Promise<Uint8Array>;
}

export interface CreateDraftResult {
  readonly dryRun: boolean;
  readonly shopId: number;
  /** The currency Etsy will use for this listing — always the shop's. */
  readonly shopCurrency: string;
  /** The currency declared in listing.json (informational). */
  readonly listingCurrency: string | undefined;
  /**
   * True when listing.json's currency differs from the shop's. The amount is
   * still sent verbatim — this integration does NOT convert (no FX).
   */
  readonly currencyMismatch: boolean;
  readonly priceAmount: number;
  readonly taxonomyId: number;
  readonly listingId: number;
  readonly state: string;
  readonly url: string;
  readonly editUrl: string;
  readonly imagesUploaded: number;
  readonly filesUploaded: number;
}

const noop = (): void => {};

async function defaultRead(path: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path));
}

function editUrlFor(listingId: number): string {
  return `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`;
}

export async function createDraftFromListingSpec(
  service: IEtsyService,
  listing: ListingSpec,
  options: CreateDraftOptions,
): Promise<CreateDraftResult> {
  const log = options.log ?? noop;
  const read = options.readFileImpl ?? defaultRead;
  const resolvePath = (p: string): string =>
    isAbsolute(p) ? p : join(options.repoRoot, p);

  // 1. shop identity. Etsy sets listing prices in the SHOP's currency; we
  //    send the amount from listing.json verbatim and never convert.
  const shop = await service.getMyShop();
  log(`shop: "${shop.shopName}" (id ${shop.shopId}, ${shop.currencyCode})`);
  const listingCurrency = listing.currency ?? undefined;
  const currencyMismatch =
    listingCurrency !== undefined && listingCurrency !== shop.currencyCode;
  if (currencyMismatch) {
    log(
      `  ! listing.json currency is ${listingCurrency} but the Etsy shop is ` +
        `${shop.currencyCode}. The amount ${Number(listing.price).toFixed(2)} ` +
        `is sent as-is (no FX). Set listing.json to ${shop.currencyCode} or ` +
        `change the shop currency in Etsy.`,
    );
  }

  // 2. taxonomy
  let taxonomyId = listing.taxonomy?.taxonomyId ?? undefined;
  if (taxonomyId === undefined || taxonomyId === null) {
    const kw = String(listing.taxonomy?.resolveKeyword ?? "Planner").toLowerCase();
    const nodes = await service.getSellerTaxonomyNodes();
    const matches = nodes
      .filter((n) => n.name.toLowerCase().includes(kw))
      .sort((a, b) => b.level - a.level);
    const best = matches[0];
    if (!best) {
      throw new Error(
        `No Etsy taxonomy node matches "${kw}". Set listing.taxonomy.taxonomyId.`,
      );
    }
    taxonomyId = best.id;
    log(`taxonomy: "${best.name}" -> id ${taxonomyId}`);
  }

  const draftInput = {
    shopId: shop.shopId,
    title: listing.title,
    description: listing.description,
    priceAmount: Number(listing.price),
    quantity: Number(listing.quantity ?? 999),
    whoMade: listing.whoMade ?? ("i_did" as EtsyWhoMade),
    whenMade: listing.whenMade ?? ("2020_2025" as EtsyWhenMade),
    taxonomyId,
    listingType: listing.listingType ?? ("download" as EtsyListingType),
    tags: listing.tags ?? [],
    materials: listing.materials ?? [],
    state: "draft" as const,
  };

  if (options.dryRun) {
    log("--dry-run — createListing NOT sent");
    return {
      dryRun: true,
      shopId: shop.shopId,
      shopCurrency: shop.currencyCode,
      listingCurrency,
      currencyMismatch,
      priceAmount: draftInput.priceAmount,
      taxonomyId,
      listingId: 0,
      state: "draft",
      url: "",
      editUrl: "",
      imagesUploaded: 0,
      filesUploaded: 0,
    };
  }

  // 3. create the draft
  let created;
  try {
    created = await service.createListing(draftInput);
  } catch (err) {
    if (err instanceof EtsyAuthError) {
      throw new EtsyAuthError(
        err.status,
        err.body,
        `Etsy auth failed (HTTP ${err.status}). The stored token likely lacks ` +
          `the "listings_w" scope — re-run the OAuth flow with ` +
          `"shops_r listings_r listings_w".`,
      );
    }
    throw err;
  }
  log(`draft listing created: id ${created.listingId} state=${created.state}`);

  // 4. images (ranked)
  let imagesUploaded = 0;
  const images = [...(listing.images ?? [])].sort(
    (a, b) => (a.rank ?? 0) - (b.rank ?? 0),
  );
  for (const img of images) {
    const bytes = await read(resolvePath(img.path));
    const fileName = img.path.split(/[\\/]/).pop() ?? "image.png";
    const res = await service.uploadListingImage({
      shopId: shop.shopId,
      listingId: created.listingId,
      fileName,
      bytes,
      ...(img.rank !== undefined ? { rank: img.rank } : {}),
      ...(img.alt !== undefined ? { altText: img.alt } : {}),
    });
    log(`  image #${res.rank}: ${res.listingImageId}`);
    imagesUploaded += 1;
  }

  // 5. digital files (ranked)
  let filesUploaded = 0;
  const files = [...(listing.files ?? [])].sort(
    (a, b) => (a.rank ?? 0) - (b.rank ?? 0),
  );
  for (const f of files) {
    const bytes = await read(resolvePath(f.path));
    const fileName = f.name ?? f.path.split(/[\\/]/).pop() ?? "file.pdf";
    const res = await service.uploadDigitalFile({
      shopId: shop.shopId,
      listingId: created.listingId,
      fileName,
      bytes,
      ...(f.rank !== undefined ? { rank: f.rank } : {}),
    });
    log(`  file #${res.rank}: ${res.listingFileId} (${res.fileName})`);
    filesUploaded += 1;
  }

  return {
    dryRun: false,
    shopId: shop.shopId,
    shopCurrency: shop.currencyCode,
    listingCurrency,
    currencyMismatch,
    priceAmount: draftInput.priceAmount,
    taxonomyId,
    listingId: created.listingId,
    state: created.state,
    url: created.url || `https://www.etsy.com/listing/${created.listingId}`,
    editUrl: editUrlFor(created.listingId),
    imagesUploaded,
    filesUploaded,
  };
}

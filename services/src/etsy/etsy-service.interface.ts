/**
 * The contract the product pipeline codes against. The pipeline imports this
 * interface, never the concrete class or the HTTP client.
 *
 * Implementation status of each method lives in ONE place — the doc comment
 * here — and is mirrored by the concrete class either doing the call or
 * throwing `EtsyNotImplementedError`.
 */

import type {
  CreateDraftListingInput,
  EtsyAuthenticatedUser,
  EtsyListing,
  EtsyListingFile,
  EtsyListingImage,
  EtsyPingResult,
  EtsyShop,
  EtsyTaxonomyNode,
  ListListingsByShopParams,
  Paginated,
  UpdateListingInput,
  UploadListingFileInput,
  UploadListingImageInput,
} from "./types.ts";

export interface IEtsyService {
  /** IMPLEMENTED. API-key liveness check — no OAuth. */
  ping(): Promise<EtsyPingResult>;

  /** IMPLEMENTED. Proves the OAuth token works; returns the token's user. */
  getAuthenticatedUser(): Promise<EtsyAuthenticatedUser>;

  /** IMPLEMENTED. Resolves the shop owned by the authenticated user. */
  getMyShop(): Promise<EtsyShop>;

  /** IMPLEMENTED. */
  getShop(shopId: number): Promise<EtsyShop>;

  /** PLANNED (publishing phase). Throws `EtsyNotImplementedError` today. */
  getListing(listingId: number): Promise<EtsyListing>;

  /** PLANNED (publishing phase). */
  getListingsByShop(
    params: ListListingsByShopParams,
  ): Promise<Paginated<EtsyListing>>;

  /** PLANNED (publishing phase). Always creates in `draft` state. */
  createListing(input: CreateDraftListingInput): Promise<EtsyListing>;

  /** PLANNED (publishing phase). */
  updateListing(input: UpdateListingInput): Promise<EtsyListing>;

  /** PLANNED (publishing phase). */
  uploadListingImage(
    input: UploadListingImageInput,
  ): Promise<EtsyListingImage>;

  /** PLANNED (publishing phase). The delivered digital product file. */
  uploadDigitalFile(input: UploadListingFileInput): Promise<EtsyListingFile>;

  /** PLANNED (listing phase). Category/taxonomy lookup. */
  getSellerTaxonomyNodes(): Promise<readonly EtsyTaxonomyNode[]>;
}

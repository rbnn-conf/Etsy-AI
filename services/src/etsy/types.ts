/**
 * Types for the Etsy integration layer's public surface.
 *
 * These are OUR shapes, deliberately narrower than Etsy's raw responses. The
 * product pipeline depends on these, never on `any` blobs from the wire. Only
 * fields the pipeline actually needs are modelled; add more as endpoints are
 * implemented, not speculatively.
 *
 * Field names mirror Etsy Open API v3 where practical to keep the mapping in
 * `etsy-service.ts` obvious.
 */

/** Result of `GET /v3/application/openapi-ping` — API-key liveness only. */
export interface EtsyPingResult {
  readonly ok: boolean;
  readonly applicationId: number | undefined;
}

/** Subset of the authenticated user (`GET /users/me`). */
export interface EtsyAuthenticatedUser {
  readonly userId: number;
  readonly shopId: number | undefined;
}

/** Subset of a shop (`GET /shops/{shop_id}`). */
export interface EtsyShop {
  readonly shopId: number;
  readonly shopName: string;
  readonly userId: number;
  readonly currencyCode: string;
  readonly isVacation: boolean;
  readonly listingActiveCount: number;
  readonly digitalListingCount: number;
  readonly url: string;
}

export type EtsyListingState =
  | "active"
  | "inactive"
  | "draft"
  | "expired"
  | "sold_out";

export type EtsyListingType = "physical" | "download" | "both";

export type EtsyWhoMade = "i_did" | "someone_else" | "collective";
export type EtsyWhenMade =
  | "made_to_order"
  | "2020_2026"
  | "2020_2025"
  | "2010_2019"
  | "before_2010"
  | (string & {});

/** Subset of a listing (`GET /listings/{listing_id}`). */
export interface EtsyListing {
  readonly listingId: number;
  readonly shopId: number;
  readonly title: string;
  readonly description: string;
  readonly state: EtsyListingState;
  readonly listingType: EtsyListingType;
  readonly priceAmount: number;
  readonly priceCurrencyCode: string;
  readonly quantity: number;
  readonly taxonomyId: number | undefined;
  readonly tags: readonly string[];
  readonly url: string;
  /** Read back for Stage 4 draft verification (absent when Etsy omits them). */
  readonly materials?: readonly string[];
  readonly whoMade?: string;
  readonly whenMade?: string;
  readonly isSupply?: boolean;
  readonly shouldAutoRenew?: boolean;
  readonly shippingProfileId?: number | null;
  readonly fileData?: string;
  /** The shop section the listing is in (ADR-054); null when none. */
  readonly shopSectionId?: number | null;
}

/** A shop section (`getShopSections` / `createShopSection`, ADR-054). */
export interface EtsyShopSection {
  readonly shopSectionId: number;
  readonly title: string;
  readonly rank?: number;
  readonly activeListingCount?: number;
}

/** A listing property value (`getListingProperties` / `updateListingProperty`). */
export interface EtsyListingPropertyValue {
  readonly propertyId: number;
  readonly propertyName: string;
  readonly valueIds: readonly number[];
  readonly values: readonly string[];
}

/** A taxonomy property with its possible values (`getPropertiesByTaxonomyId`). */
export interface EtsyTaxonomyProperty {
  readonly propertyId: number;
  readonly name: string;
  readonly displayName: string;
  readonly isMultivalued: boolean;
  readonly possibleValues: readonly { readonly valueId: number; readonly name: string }[];
}

/** Input for `createListing` — the required + commonly-set fields only. */
export interface CreateDraftListingInput {
  readonly shopId: number;
  readonly title: string;
  readonly description: string;
  readonly priceAmount: number;
  readonly quantity: number;
  readonly whoMade: EtsyWhoMade;
  readonly whenMade: EtsyWhenMade;
  readonly taxonomyId: number;
  readonly listingType?: EtsyListingType;
  readonly tags?: readonly string[];
  readonly materials?: readonly string[];
  /** Draft is the only safe default for an automated pipeline. */
  readonly state?: "draft";
}

export interface UpdateListingInput {
  readonly shopId: number;
  readonly listingId: number;
  readonly title?: string;
  readonly description?: string;
  readonly priceAmount?: number;
  readonly quantity?: number;
  readonly tags?: readonly string[];
  /**
   * Only "inactive" may be set here. Activation (publishing) has exactly one
   * path, `EtsyService.activateListing`, behind the server-side publish gate.
   */
  readonly state?: "inactive";
  /** Move the listing into this shop section (ADR-054). Requires listings_w. */
  readonly shopSectionId?: number;
}

export interface UploadListingImageInput {
  readonly shopId: number;
  readonly listingId: number;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly rank?: number;
  readonly altText?: string;
}

export interface UploadListingFileInput {
  readonly shopId: number;
  readonly listingId: number;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly rank?: number;
}

export interface EtsyListingImage {
  readonly listingImageId: number;
  readonly url: string;
  readonly rank: number;
}

export interface EtsyListingFile {
  readonly listingFileId: number;
  readonly fileName: string;
  readonly rank: number;
}

/** One node of the seller taxonomy tree (`GET /seller-taxonomy/nodes`). */
export interface EtsyTaxonomyNode {
  readonly id: number;
  readonly name: string;
  readonly level: number;
  readonly parentId: number | undefined;
  readonly path: readonly string[];
}

export interface ListListingsByShopParams {
  readonly shopId: number;
  readonly state?: EtsyListingState;
  readonly limit?: number;
  readonly offset?: number;
}

export interface Paginated<T> {
  readonly count: number;
  readonly results: readonly T[];
}

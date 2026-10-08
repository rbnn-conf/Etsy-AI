/**
 * EtsyService — the single entry point the product pipeline uses to talk to
 * Etsy. Nothing outside this file (and its helpers `http-client`, `oauth`,
 * `token-store`) constructs an Etsy HTTP request.
 *
 *   Product Pipeline  ->  EtsyService  ->  EtsyHttpClient  ->  Etsy API
 *
 * IMPLEMENTED here: `ping`, `getAuthenticatedUser`, `getMyShop`, `getShop`.
 * Those are the minimum to prove API-key + OAuth connectivity and to discover
 * the shop id. Every other interface method throws `EtsyNotImplementedError`
 * with a pointer to the phase that will build it — deliberately NOT a stub
 * that pretends to succeed.
 */

import {
  canRunOAuthFlow,
  type EtsyConfig,
  loadEtsyConfig,
} from "../config/env.ts";
import { EtsyAuthError, EtsyNotImplementedError, EtsyPublishBlockedError } from "./errors.ts";
import { EtsyHttpClient, type EtsyHttpClientOptions } from "./http-client.ts";
import type { IEtsyService } from "./etsy-service.interface.ts";
import {
  EtsyOAuthClient,
  type EtsyTokenSet,
  isAccessTokenExpired,
} from "./oauth.ts";
import { InMemoryTokenStore, type TokenStore } from "./token-store.ts";
import type {
  CreateDraftListingInput,
  EtsyAuthenticatedUser,
  EtsyListing,
  EtsyListingFile,
  EtsyListingImage,
  EtsyListingPropertyValue,
  EtsyPingResult,
  EtsyTaxonomyProperty,
  EtsyShop,
  EtsyShopSection,
  EtsyTaxonomyNode,
  ListListingsByShopParams,
  Paginated,
  UpdateListingInput,
  UploadListingFileInput,
  UploadListingImageInput,
} from "./types.ts";

const APP = "/application";

export interface EtsyServiceOptions {
  readonly config?: EtsyConfig;
  readonly tokenStore?: TokenStore;
  /** Overrides forwarded to the HTTP client (fetch/sleep impls for tests). */
  readonly httpOptions?: Partial<
    Pick<
      EtsyHttpClientOptions,
      "fetchImpl" | "sleepImpl" | "retryPolicy" | "minRequestIntervalMs" | "timeoutMs"
    >
  >;
  /** Injectable OAuth client for tests. */
  readonly oauthClient?: EtsyOAuthClient;
}

export class EtsyService implements IEtsyService {
  readonly #config: EtsyConfig;
  readonly #tokenStore: TokenStore;
  readonly #oauth: EtsyOAuthClient;
  readonly #http: EtsyHttpClient;

  /** In-flight refresh, so concurrent calls don't each hit the token endpoint. */
  #refreshing: Promise<EtsyTokenSet> | undefined;

  constructor(options: EtsyServiceOptions = {}) {
    this.#config = options.config ?? loadEtsyConfig();
    this.#tokenStore = options.tokenStore ?? new InMemoryTokenStore();
    this.#oauth =
      options.oauthClient ??
      new EtsyOAuthClient({ clientId: this.#config.apiKey, ...(this.#config.sharedSecret ? {sharedSecret:this.#config.sharedSecret} : {}) });

    this.#http = new EtsyHttpClient({
      apiBaseUrl: this.#config.apiBaseUrl,
      apiKey: this.#config.sharedSecret ? `${this.#config.apiKey}:${this.#config.sharedSecret}` : this.#config.apiKey,
      getAccessToken: () => this.#accessToken(),
      onUnauthorized: async()=>{await this.#accessToken(true);},
      ...options.httpOptions,
    });
  }

  get config(): EtsyConfig {
    return this.#config;
  }

  /** Whether an authorization-code flow could be run with the current config. */
  canAuthenticate(): boolean {
    return canRunOAuthFlow(this.#config);
  }

  // --- Access-token plumbing -------------------------------------------------

  async #accessToken(force=false): Promise<string> {
    const current = await this.#tokenStore.load();
    if (current === undefined) {
      throw new EtsyAuthError(
        401,
        undefined,
        "No Etsy OAuth token stored. Run the authorize-url + exchange-code scripts first (see services/README.md).",
      );
    }
    if (!force && !isAccessTokenExpired(current)) return current.accessToken;

    if (this.#refreshing === undefined) {
      this.#refreshing = this.#oauth
        .refreshAccessToken(current.refreshToken)
        .then(async (next) => {
          await this.#tokenStore.save(next);
          return next;
        })
        .finally(() => {
          this.#refreshing = undefined;
        });
    }
    return (await this.#refreshing).accessToken;
  }

  // --- IMPLEMENTED endpoints ----------------------------------------------

  async ping(): Promise<EtsyPingResult> {
    const raw = await this.#http.request<{ application_id?: number }>({
      method: "GET",
      path: `${APP}/openapi-ping`,
    });
    return {
      ok: true,
      applicationId: raw.application_id,
    };
  }

  async getAuthenticatedUser(): Promise<EtsyAuthenticatedUser> {
    const raw = await this.#http.request<{
      user_id: number;
      shop_id?: number;
    }>({
      method: "GET",
      path: `${APP}/users/me`,
      authenticated: true,
    });
    return { userId: raw.user_id, shopId: raw.shop_id };
  }

  async getMyShop(): Promise<EtsyShop> {
    const me = await this.getAuthenticatedUser();
    if (me.shopId !== undefined) return this.getShop(me.shopId);

    const raw = await this.#http.request<{ results?: RawShop[] }>({
      method: "GET",
      path: `${APP}/users/${me.userId}/shops`,
      authenticated: true,
    });
    const first = raw.results?.[0];
    if (first === undefined) {
      throw new EtsyAuthError(
        403,
        raw,
        `Authenticated Etsy user ${me.userId} has no shop.`,
      );
    }
    return mapShop(first);
  }

  /**
   * Shop owned by a user (`getShopByOwnerUserId`, GET /users/{user_id}/shops).
   * Read-only and needs no OAuth scope (unlike `users/me`, which needs shops_r),
   * but Etsy requires the user's bearer token: without it the live API answers
   * 403 "No user was provided as part of the bearer token" (verified 2026-09-28;
   * the published spec does not declare this). `userId` is the numeric prefix
   * of the access token, as Etsy's authentication guide documents.
   */
  async getShopByOwnerUserId(userId: number): Promise<EtsyShop | undefined> {
    const raw = await this.#http.request<RawShop | { results?: RawShop[] }>({
      method: "GET",
      path: `${APP}/users/${userId}/shops`,
      authenticated: true,
    });
    const shop = "shop_id" in raw ? raw : raw.results?.[0];
    return shop ? mapShop(shop) : undefined;
  }

  async getShop(shopId: number): Promise<EtsyShop> {
    const raw = await this.#http.request<RawShop>({
      method: "GET",
      path: `${APP}/shops/${shopId}`,
    });
    return mapShop(raw);
  }

  // --- IMPLEMENTED: the minimum path to a draft digital listing ---------
  //
  // Verified against Etsy Open API v3 (developers.etsy.com, 2026-08):
  //   - createDraftListing / updateListing bodies are x-www-form-urlencoded,
  //     NOT JSON. Arrays (tags, materials) are comma-joined strings.
  //   - image/file uploads are multipart/form-data (fields `image` / `file`).
  //   - price on create is a decimal string; on read it is
  //     {amount, divisor, currency_code}.

  async getListing(listingId: number): Promise<EtsyListing> {
    const raw = await this.#http.request<RawListing>({
      method: "GET",
      path: `${APP}/listings/${listingId}`,
      authenticated: true,
    });
    return mapListing(raw);
  }

  async getListingsByShop(
    params: ListListingsByShopParams,
  ): Promise<Paginated<EtsyListing>> {
    const raw = await this.#http.request<{count:number;results:RawListing[]}>({
      method:"GET",path:`${APP}/shops/${params.shopId}/listings`,authenticated:true,
      query:{state:params.state ?? "draft",limit:params.limit ?? 100,offset:params.offset ?? 0}
    });
    return {count:raw.count,results:raw.results.map(mapListing)};
  }

  async createListing(input: CreateDraftListingInput): Promise<EtsyListing> {
    if (input.state !== undefined && input.state !== "draft") throw new Error("Only drafts may be created");
    const form = new URLSearchParams({
      quantity: String(input.quantity),
      title: input.title,
      description: input.description,
      price: input.priceAmount.toFixed(2),
      who_made: input.whoMade,
      when_made: input.whenMade,
      taxonomy_id: String(input.taxonomyId),
      type: input.listingType ?? "download",
      state: input.state ?? "draft",
      should_auto_renew: "false",
      is_supply: "false",
    });
    if (input.tags && input.tags.length > 0) {
      form.set("tags", input.tags.join(","));
    }
    if (input.materials && input.materials.length > 0) {
      form.set("materials", input.materials.join(","));
    }

    const raw = await this.#http.request<RawListing>({
      method: "POST",
      path: `${APP}/shops/${input.shopId}/listings`,
      authenticated: true,
      rawBody: form,
    });
    return mapListing(raw);
  }

  async updateListing(input: UpdateListingInput): Promise<EtsyListing> {
    // Publishing is never a side effect of an update: see activateListing.
    if ((input.state as string | undefined) === "active") {
      throw new EtsyPublishBlockedError("updateListing cannot activate a listing; only activateListing can, behind the publish gate");
    }
    const form = new URLSearchParams();
    if (input.title !== undefined) form.set("title", input.title);
    if (input.description !== undefined) form.set("description", input.description);
    if (input.priceAmount !== undefined) form.set("price", input.priceAmount.toFixed(2));
    if (input.quantity !== undefined) form.set("quantity", String(input.quantity));
    if (input.tags !== undefined) form.set("tags", input.tags.join(","));
    if (input.state !== undefined) form.set("state", input.state);
    if (input.shopSectionId !== undefined) form.set("shop_section_id", String(input.shopSectionId));

    const raw = await this.#http.request<RawListing>({
      method: "PATCH",
      path: `${APP}/shops/${input.shopId}/listings/${input.listingId}`,
      authenticated: true,
      rawBody: form,
    });
    return mapListing(raw);
  }

  async uploadListingImage(
    input: UploadListingImageInput,
  ): Promise<EtsyListingImage> {
    const fd = new FormData();
    fd.append(
      "image",
      new Blob([toArrayBuffer(input.bytes)]),
      input.fileName,
    );
    if (input.rank !== undefined) fd.append("rank", String(input.rank));
    if (input.altText !== undefined) fd.append("alt_text", input.altText);

    const raw = await this.#http.request<{
      listing_image_id: number;
      url_fullxfull?: string;
      url?: string;
      rank: number;
    }>({
      method: "POST",
      path: `${APP}/shops/${input.shopId}/listings/${input.listingId}/images`,
      authenticated: true,
      rawBody: fd,
    });
    return {
      listingImageId: raw.listing_image_id,
      url: raw.url_fullxfull ?? raw.url ?? "",
      rank: raw.rank,
    };
  }

  async uploadDigitalFile(
    input: UploadListingFileInput,
  ): Promise<EtsyListingFile> {
    const fd = new FormData();
    fd.append("file", new Blob([toArrayBuffer(input.bytes)]), input.fileName);
    fd.append("name", input.fileName);
    if (input.rank !== undefined) fd.append("rank", String(input.rank));

    const raw = await this.#http.request<{
      listing_file_id: number;
      filename?: string;
      name?: string;
      rank: number;
    }>({
      method: "POST",
      path: `${APP}/shops/${input.shopId}/listings/${input.listingId}/files`,
      authenticated: true,
      rawBody: fd,
    });
    return {
      listingFileId: raw.listing_file_id,
      fileName: raw.filename ?? raw.name ?? input.fileName,
      rank: raw.rank,
    };
  }

  async getSellerTaxonomyNodes(): Promise<readonly EtsyTaxonomyNode[]> {
    const raw = await this.#http.request<{ results: RawTaxonomyNode[] }>({
      method: "GET",
      path: `${APP}/seller-taxonomy/nodes`,
    });
    const flat: EtsyTaxonomyNode[] = [];
    const walk = (nodes: RawTaxonomyNode[]): void => {
      for (const n of nodes) {
        flat.push({
          id: n.id,
          name: n.name,
          level: n.level,
          parentId: n.parent_id ?? undefined,
          path: n.full_path_taxonomy_ids
            ? n.full_path_taxonomy_ids.map(String)
            : n.path ?? [n.name],
        });
        if (n.children && n.children.length > 0) walk(n.children);
      }
    };
    walk(raw.results ?? []);
    return flat;
  }

  /**
   * THE ONLY code path in the repository that sets `state=active` (which
   * publishes a listing on etsy.com and may trigger Etsy's listing fees).
   * Refuses unless ALL hold:
   *   - the server-side gate `ETSY_PUBLISH_ENABLED=true` (config.publishEnabled);
   *   - `confirmation` is exactly `ACTIVATE <listingId>` (the caller's explicit
   *     owner confirmation, bound to this listing);
   *   - the remote listing belongs to `shopId`, is a `draft` or `inactive`
   *     digital download.
   * Returns the listing as Etsy reports it after the PATCH; callers must still
   * read it back before recording it as published.
   */
  async activateListing(input: { readonly shopId: number; readonly listingId: number; readonly confirmation: string }): Promise<EtsyListing> {
    if (this.#config.publishEnabled !== true) {
      throw new EtsyPublishBlockedError("Publishing is disabled on this server (ETSY_PUBLISH_ENABLED is not true)");
    }
    if (input.confirmation !== `ACTIVATE ${input.listingId}`) {
      throw new EtsyPublishBlockedError("Activation needs the explicit confirmation for this exact listing");
    }
    const current = await this.getListing(input.listingId);
    if (current.shopId !== input.shopId) throw new EtsyPublishBlockedError("Listing does not belong to the configured shop");
    if (current.state !== "draft" && current.state !== "inactive") throw new EtsyPublishBlockedError(`Listing is ${current.state}, not a draft`);
    if (current.listingType !== "download") throw new EtsyPublishBlockedError("Listing is not a digital download");
    const raw = await this.#http.request<RawListing>({
      method: "PATCH",
      path: `${APP}/shops/${input.shopId}/listings/${input.listingId}`,
      authenticated: true,
      rawBody: new URLSearchParams({ state: "active" }),
    });
    return mapListing(raw);
  }

  /** Taxonomy properties (e.g. Occasion, Primary color) with their possible values. Public GET. */
  async getPropertiesByTaxonomyId(taxonomyId: number): Promise<readonly EtsyTaxonomyProperty[]> {
    const raw = await this.#http.request<{ results: RawTaxonomyProperty[] }>({
      method: "GET",
      path: `${APP}/seller-taxonomy/nodes/${taxonomyId}/properties`,
    });
    return (raw.results ?? []).map((p) => ({
      propertyId: p.property_id,
      name: p.name,
      displayName: p.display_name ?? p.name,
      isMultivalued: p.is_multivalued === true,
      possibleValues: (p.possible_values ?? []).map((v) => ({ valueId: v.value_id, name: v.name })),
    }));
  }

  /** Current property values on a listing. */
  async getListingProperties(shopId: number, listingId: number): Promise<readonly EtsyListingPropertyValue[]> {
    const raw = await this.#http.request<{ results: RawListingProperty[] }>({
      method: "GET",
      path: `${APP}/shops/${shopId}/listings/${listingId}/properties`,
      authenticated: true,
    });
    return (raw.results ?? []).map(mapProperty);
  }

  /** Set one property on a listing (idempotent PUT). Never changes listing state. */
  async updateListingProperty(input: {
    readonly shopId: number; readonly listingId: number; readonly propertyId: number;
    readonly valueIds: readonly number[]; readonly values: readonly string[];
  }): Promise<EtsyListingPropertyValue> {
    const form = new URLSearchParams({ value_ids: input.valueIds.join(","), values: input.values.join(",") });
    const raw = await this.#http.request<RawListingProperty>({
      method: "PUT",
      path: `${APP}/shops/${input.shopId}/listings/${input.listingId}/properties/${input.propertyId}`,
      authenticated: true,
      rawBody: form,
    });
    return mapProperty(raw);
  }

  async setDraftDownload(shopId:number,listingId:number):Promise<void> {
    const current=await this.getListing(listingId);
    if(current.shopId!==shopId || current.state!=="draft")throw new Error("Draft identity/state mismatch");
    await this.#http.request({method:"PATCH",path:`${APP}/shops/${shopId}/listings/${listingId}`,authenticated:true,
      rawBody:new URLSearchParams({type:"download",should_auto_renew:"false"})});
  }
  // --- shop sections (ADR-054) ------------------------------------------
  // getShopSections: GET /shops/{shop_id}/sections (no extra scope).
  // createShopSection: POST /shops/{shop_id}/sections, form body `title`; needs the shops_w scope.
  // A listing's section is set with updateListing({shopSectionId}) (listings_w).
  async getShopSections(shopId:number):Promise<readonly EtsyShopSection[]> {
    const raw=await this.#http.request<{results:RawShopSection[]}>({method:"GET",path:`${APP}/shops/${shopId}/sections`,authenticated:true});
    return (raw.results??[]).map(mapShopSection);
  }
  async createShopSection(input:{readonly shopId:number;readonly title:string}):Promise<EtsyShopSection> {
    const raw=await this.#http.request<RawShopSection>({method:"POST",path:`${APP}/shops/${input.shopId}/sections`,authenticated:true,
      rawBody:new URLSearchParams({title:input.title})});
    return mapShopSection(raw);
  }
  async getListingImages(listingId:number):Promise<{listing_image_id:number;rank:number;alt_text?:string}[]> {
    const raw=await this.#http.request<{results:{listing_image_id:number;rank:number;alt_text?:string}[]}>({method:"GET",path:`${APP}/listings/${listingId}/images`,authenticated:true});
    return raw.results;
  }
  async getListingFiles(shopId:number,listingId:number):Promise<{listing_file_id:number;filename:string;rank:number;size_bytes:number}[]> {
    const raw=await this.#http.request<{results:{listing_file_id:number;filename:string;rank:number;size_bytes:number}[]}>({method:"GET",path:`${APP}/shops/${shopId}/listings/${listingId}/files`,authenticated:true});
    return raw.results;
  }
}

// --- raw -> domain mapping --------------------------------------------------

interface RawShop {
  shop_id: number;
  shop_name: string;
  user_id: number;
  currency_code: string;
  is_vacation: boolean;
  listing_active_count: number;
  digital_listing_count: number;
  url: string;
}

function mapShop(raw: RawShop): EtsyShop {
  return {
    shopId: raw.shop_id,
    shopName: raw.shop_name,
    userId: raw.user_id,
    currencyCode: raw.currency_code,
    isVacation: raw.is_vacation,
    listingActiveCount: raw.listing_active_count,
    digitalListingCount: raw.digital_listing_count,
    url: raw.url,
  };
}

interface RawListing {
  listing_id: number;
  shop_id: number;
  title: string;
  description: string;
  state: string;
  listing_type?: string;
  type?: string;
  price?: { amount: number; divisor: number; currency_code: string };
  quantity: number;
  taxonomy_id?: number;
  tags?: string[];
  url: string;
  materials?: string[];
  who_made?: string;
  when_made?: string;
  is_supply?: boolean;
  should_auto_renew?: boolean;
  shipping_profile_id?: number | null;
  file_data?: string;
  shop_section_id?: number | null;
}

interface RawShopSection {
  shop_section_id: number;
  title: string;
  rank?: number;
  active_listing_count?: number;
}
function mapShopSection(raw: RawShopSection): EtsyShopSection {
  return {shopSectionId:raw.shop_section_id,title:raw.title,
    ...(raw.rank !== undefined ? {rank:raw.rank} : {}),...(raw.active_listing_count !== undefined ? {activeListingCount:raw.active_listing_count} : {})};
}

interface RawTaxonomyProperty {
  property_id: number;
  name: string;
  display_name?: string;
  is_multivalued?: boolean;
  possible_values?: { value_id: number; name: string }[];
}

interface RawListingProperty {
  property_id: number;
  property_name?: string;
  value_ids?: number[];
  values?: string[];
}

function mapProperty(raw: RawListingProperty): EtsyListingPropertyValue {
  return {
    propertyId: raw.property_id,
    propertyName: raw.property_name ?? "",
    valueIds: raw.value_ids ?? [],
    values: raw.values ?? [],
  };
}

interface RawTaxonomyNode {
  id: number;
  name: string;
  level: number;
  parent_id?: number | null;
  path?: string[];
  full_path_taxonomy_ids?: number[];
  children?: RawTaxonomyNode[];
}

function mapListing(raw: RawListing): EtsyListing {
  const divisor = raw.price?.divisor && raw.price.divisor > 0 ? raw.price.divisor : 100;
  return {
    listingId: raw.listing_id,
    shopId: raw.shop_id,
    title: raw.title,
    description: raw.description,
    state: raw.state as EtsyListing["state"],
    listingType: (raw.listing_type ?? raw.type ?? "download") as EtsyListing["listingType"],
    priceAmount: raw.price ? raw.price.amount / divisor : 0,
    priceCurrencyCode: raw.price?.currency_code ?? "USD",
    quantity: raw.quantity,
    taxonomyId: raw.taxonomy_id,
    tags: raw.tags ?? [],
    url: raw.url,
    ...(raw.materials !== undefined ? { materials: raw.materials } : {}),
    ...(raw.who_made !== undefined ? { whoMade: raw.who_made } : {}),
    ...(raw.when_made !== undefined ? { whenMade: raw.when_made } : {}),
    ...(raw.is_supply !== undefined ? { isSupply: raw.is_supply } : {}),
    ...(raw.should_auto_renew !== undefined ? { shouldAutoRenew: raw.should_auto_renew } : {}),
    ...(raw.shipping_profile_id !== undefined ? { shippingProfileId: raw.shipping_profile_id } : {}),
    ...(raw.file_data !== undefined ? { fileData: raw.file_data } : {}),
    ...(raw.shop_section_id !== undefined ? { shopSectionId: raw.shop_section_id } : {}),
  };
}

/** Blob wants an ArrayBuffer-backed view; copy to be safe across Uint8Array kinds. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

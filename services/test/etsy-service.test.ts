import { test } from "node:test";
import assert from "node:assert/strict";

import { loadEtsyConfig } from "../src/config/env.ts";
import { EtsyService } from "../src/etsy/etsy-service.ts";
import {
  EtsyAuthError,
  EtsyRateLimitError,
} from "../src/etsy/errors.ts";
import { InMemoryTokenStore } from "../src/etsy/token-store.ts";
import type { EtsyOAuthClient, EtsyTokenSet } from "../src/etsy/oauth.ts";
import { makeFakeFetch, noSleep, throwingFetch } from "./helpers/fake-fetch.ts";

const config = loadEtsyConfig({
  env: {
    ETSY_API_KEYSTRING: "test-keystring",
    ETSY_OAUTH_REDIRECT_URI: "https://example.test/cb",
  },
});

function freshToken(overrides: Partial<EtsyTokenSet> = {}): EtsyTokenSet {
  return {
    accessToken: "12345.access",
    refreshToken: "12345.refresh",
    tokenType: "Bearer",
    expiresIn: 3600,
    obtainedAt: Date.now(),
    ...overrides,
  };
}

test("constructs from config without performing any I/O", () => {
  const service = new EtsyService({ config });
  assert.equal(service.config.apiKey, "test-keystring");
  assert.equal(service.canAuthenticate(), true);
});

test("ping() hits openapi-ping with the api key and no bearer", async () => {
  const fake = makeFakeFetch([{ body: { application_id: 42 } }]);
  const service = new EtsyService({
    config,
    httpOptions: { fetchImpl: fake.fn, sleepImpl: noSleep },
  });

  const result = await service.ping();
  assert.deepEqual(result, { ok: true, applicationId: 42 });

  const call = fake.calls[0]!;
  assert.match(call.url, /\/application\/openapi-ping$/);
  assert.equal(call.headers["x-api-key"], "test-keystring");
  assert.equal("authorization" in call.headers, false);
});

test("getShop() maps the raw Etsy payload onto the domain shape", async () => {
  const fake = makeFakeFetch([
    {
      body: {
        shop_id: 777,
        shop_name: "Test Shop",
        user_id: 12345,
        currency_code: "USD",
        is_vacation: false,
        listing_active_count: 10,
        digital_listing_count: 8,
        url: "https://www.etsy.com/shop/TestShop",
      },
    },
  ]);
  const service = new EtsyService({
    config,
    httpOptions: { fetchImpl: fake.fn, sleepImpl: noSleep },
  });

  const shop = await service.getShop(777);
  assert.deepEqual(shop, {
    shopId: 777,
    shopName: "Test Shop",
    userId: 12345,
    currencyCode: "USD",
    isVacation: false,
    listingActiveCount: 10,
    digitalListingCount: 8,
    url: "https://www.etsy.com/shop/TestShop",
  });
  assert.match(fake.calls[0]!.url, /\/application\/shops\/777$/);
});

test("authenticated call without a stored token raises EtsyAuthError", async () => {
  const fake = makeFakeFetch([{ body: {} }]);
  const service = new EtsyService({
    config,
    tokenStore: new InMemoryTokenStore(),
    httpOptions: { fetchImpl: fake.fn, sleepImpl: noSleep },
  });

  await assert.rejects(() => service.getAuthenticatedUser(), EtsyAuthError);
  assert.equal(fake.calls.length, 0, "must not call the API with no token");
});

test("getAuthenticatedUser() attaches the bearer token from the store", async () => {
  const fake = makeFakeFetch([{ body: { user_id: 12345, shop_id: 777 } }]);
  const service = new EtsyService({
    config,
    tokenStore: new InMemoryTokenStore(freshToken()),
    httpOptions: { fetchImpl: fake.fn, sleepImpl: noSleep },
  });

  const me = await service.getAuthenticatedUser();
  assert.deepEqual(me, { userId: 12345, shopId: 777 });
  assert.equal(fake.calls[0]!.headers["authorization"], "Bearer 12345.access");
});

test("an expired access token is refreshed once before the call", async () => {
  const fake = makeFakeFetch([{ body: { user_id: 1, shop_id: 2 } }]);
  let refreshCount = 0;
  const oauthClient = {
    async refreshAccessToken(): Promise<EtsyTokenSet> {
      refreshCount += 1;
      return freshToken({ accessToken: "12345.new-access" });
    },
  } as unknown as EtsyOAuthClient;

  const service = new EtsyService({
    config,
    tokenStore: new InMemoryTokenStore(
      freshToken({ obtainedAt: Date.now() - 7_200_000 }),
    ),
    oauthClient,
    httpOptions: { fetchImpl: fake.fn, sleepImpl: noSleep },
  });

  await service.getAuthenticatedUser();
  assert.equal(refreshCount, 1);
  assert.equal(fake.calls[0]!.headers["authorization"], "Bearer 12345.new-access");
});

test("a GET 401 refreshes once and repeats with the new bearer",async()=>{
  const fake=makeFakeFetch([{status:401,body:{error:"expired"}},{body:{user_id:1,shop_id:2}}]);
  let refreshCount=0;
  const oauthClient={async refreshAccessToken(){refreshCount++;return freshToken({accessToken:"12345.refreshed"});}} as unknown as EtsyOAuthClient;
  const service=new EtsyService({config,tokenStore:new InMemoryTokenStore(freshToken()),oauthClient,httpOptions:{fetchImpl:fake.fn,sleepImpl:noSleep,minRequestIntervalMs:0}});
  assert.deepEqual(await service.getAuthenticatedUser(),{userId:1,shopId:2});
  assert.equal(refreshCount,1);assert.equal(fake.calls.length,2);
  assert.equal(fake.calls[1]!.headers.authorization,"Bearer 12345.refreshed");
});

test("a failed POST is never retried blindly",async()=>{
  const fake=makeFakeFetch([{status:503,body:{error:"uncertain"}}]);
  const service=new EtsyService({config,tokenStore:new InMemoryTokenStore(freshToken()),httpOptions:{fetchImpl:fake.fn,sleepImpl:noSleep,retryPolicy:{maxAttempts:4,baseDelayMs:1,maxDelayMs:2}}});
  await assert.rejects(()=>service.createListing({shopId:777,title:"x",description:"x",priceAmount:1,quantity:1,whoMade:"i_did",whenMade:"made_to_order",taxonomyId:1}));
  assert.equal(fake.calls.length,1);
});

test("429 responses are retried and then surfaced as EtsyRateLimitError", async () => {
  const fake = makeFakeFetch([
    { status: 429, headers: { "retry-after": "0" }, body: { error: "slow down" } },
    { status: 429, headers: { "retry-after": "0" }, body: { error: "slow down" } },
    { status: 429, headers: { "retry-after": "0" }, body: { error: "slow down" } },
    { status: 429, headers: { "retry-after": "0" }, body: { error: "slow down" } },
  ]);
  const service = new EtsyService({
    config,
    httpOptions: {
      fetchImpl: fake.fn,
      sleepImpl: noSleep,
      retryPolicy: { maxAttempts: 4, baseDelayMs: 1, maxDelayMs: 2 },
      minRequestIntervalMs: 0,
    },
  });

  await assert.rejects(() => service.ping(), EtsyRateLimitError);
  assert.equal(fake.calls.length, 4, "3 retries after the first attempt");
});

test("transport failures are retried then surfaced", async () => {
  const service = new EtsyService({
    config,
    httpOptions: {
      fetchImpl: throwingFetch(),
      sleepImpl: noSleep,
      retryPolicy: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 2 },
      minRequestIntervalMs: 0,
    },
  });
  await assert.rejects(() => service.ping());
});

test("getListingsByShop reads only the requested shop's drafts", async () => {
  const fake = makeFakeFetch([{ body: { count: 0, results: [] } }]);
  const service = new EtsyService({config,tokenStore:new InMemoryTokenStore(freshToken()),httpOptions:{fetchImpl:fake.fn,sleepImpl:noSleep}});
  assert.deepEqual(await service.getListingsByShop({shopId:777,state:"draft",limit:1}),{count:0,results:[]});
  assert.match(fake.calls[0]!.url,/\/application\/shops\/777\/listings\?state=draft&limit=1&offset=0$/);
});

test("createListing POSTs a form-encoded draft listing with a bearer token", async () => {
  const fake = makeFakeFetch([
    {
      body: {
        listing_id: 555,
        shop_id: 777,
        title: "Minimalist Monthly Budget Planner",
        description: "desc",
        state: "draft",
        type: "download",
        price: { amount: 600, divisor: 100, currency_code: "USD" },
        quantity: 999,
        taxonomy_id: 123,
        tags: ["budget planner"],
        url: "https://www.etsy.com/listing/555",
      },
    },
  ]);
  const service = new EtsyService({
    config,
    tokenStore: new InMemoryTokenStore(freshToken()),
    httpOptions: { fetchImpl: fake.fn, sleepImpl: noSleep },
  });

  const listing = await service.createListing({
    shopId: 777,
    title: "Minimalist Monthly Budget Planner",
    description: "desc",
    priceAmount: 6,
    quantity: 999,
    whoMade: "i_did",
    whenMade: "2020_2025",
    taxonomyId: 123,
    listingType: "download",
    tags: ["budget planner", "monthly budget"],
    materials: ["PDF"],
  });

  assert.equal(listing.listingId, 555);
  assert.equal(listing.state, "draft");
  assert.equal(listing.priceAmount, 6);

  const call = fake.calls[0]!;
  assert.equal(call.method, "POST");
  assert.match(call.url, /\/application\/shops\/777\/listings$/);
  assert.equal(call.headers["authorization"], "Bearer 12345.access");
  const sent = new URLSearchParams(call.body ?? "");
  assert.equal(sent.get("price"), "6.00");
  assert.equal(sent.get("type"), "download");
  assert.equal(sent.get("state"), "draft");
  assert.equal(sent.get("should_auto_renew"), "false");
  assert.equal(sent.get("who_made"), "i_did");
  assert.equal(sent.get("taxonomy_id"), "123");
  assert.equal(sent.get("tags"), "budget planner,monthly budget");
  assert.equal(sent.get("materials"), "PDF");
});

test("uploadDigitalFile and uploadListingImage send multipart bodies", async () => {
  const fake = makeFakeFetch([
    { body: { listing_file_id: 9, name: "x.pdf", rank: 1 } },
    { body: { listing_image_id: 8, url_fullxfull: "https://img", rank: 1 } },
  ]);
  const service = new EtsyService({
    config,
    tokenStore: new InMemoryTokenStore(freshToken()),
    httpOptions: { fetchImpl: fake.fn, sleepImpl: noSleep },
  });

  const f = await service.uploadDigitalFile({
    shopId: 777,
    listingId: 555,
    fileName: "x.pdf",
    bytes: new Uint8Array([1, 2, 3]),
    rank: 1,
  });
  assert.equal(f.listingFileId, 9);
  assert.match(fake.calls[0]!.url, /\/listings\/555\/files$/);
  // multipart: our client must NOT force application/json
  assert.notEqual(fake.calls[0]!.headers["content-type"], "application/json");

  const img = await service.uploadListingImage({
    shopId: 777,
    listingId: 555,
    fileName: "x.png",
    bytes: new Uint8Array([4, 5, 6]),
    rank: 1,
    altText: "cover",
  });
  assert.equal(img.listingImageId, 8);
  assert.equal(img.url, "https://img");
  assert.match(fake.calls[1]!.url, /\/listings\/555\/images$/);
});

test("getSellerTaxonomyNodes flattens the tree", async () => {
  const fake = makeFakeFetch([
    {
      body: {
        results: [
          {
            id: 1, name: "Paper & Party Supplies", level: 1,
            children: [
              { id: 2, name: "Paper", level: 2, parent_id: 1, full_path_taxonomy_ids: [1, 2],
                children: [{ id: 3, name: "Planners & Agendas", level: 3, parent_id: 2, full_path_taxonomy_ids: [1, 2, 3] }] },
            ],
          },
        ],
      },
    },
  ]);
  const service = new EtsyService({
    config,
    httpOptions: { fetchImpl: fake.fn, sleepImpl: noSleep },
  });
  const nodes = await service.getSellerTaxonomyNodes();
  assert.equal(nodes.length, 3);
  const planners = nodes.find((n) => n.name === "Planners & Agendas");
  assert.ok(planners);
  assert.equal(planners.id, 3);
  assert.deepEqual(planners.path, ["1", "2", "3"]);
});

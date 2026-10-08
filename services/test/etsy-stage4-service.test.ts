// Stage 4 (ADR-026) additions to EtsyService: the single, server-gated
// activation path, and the listing-property endpoints. Fake fetch only.
import { test } from "node:test";
import assert from "node:assert/strict";

import { loadEtsyConfig } from "../src/config/env.ts";
import { EtsyService } from "../src/etsy/etsy-service.ts";
import { EtsyPublishBlockedError } from "../src/etsy/errors.ts";
import { InMemoryTokenStore } from "../src/etsy/token-store.ts";
import { makeFakeFetch, noSleep } from "./helpers/fake-fetch.ts";

const env = { ETSY_API_KEYSTRING: "test-keystring" };
const token = { accessToken: "12345.access", refreshToken: "12345.refresh", tokenType: "Bearer", expiresIn: 3600, obtainedAt: Date.now() };
const draft = { listing_id: 55, shop_id: 7, title: "T", description: "D", state: "draft", listing_type: "download", quantity: 999, url: "https://www.etsy.com/listing/55/t" };

function service(extraEnv: Record<string, string>, responses: Parameters<typeof makeFakeFetch>[0]) {
  const fake = makeFakeFetch(responses);
  const tokenStore = new InMemoryTokenStore();
  void tokenStore.save(token);
  const s = new EtsyService({ config: loadEtsyConfig({ env: { ...env, ...extraEnv } }), tokenStore, httpOptions: { fetchImpl: fake.fn, sleepImpl: noSleep, minRequestIntervalMs: 0 } });
  return { s, fake };
}

test("ETSY_PUBLISH_ENABLED defaults to false and only the exact string 'true' enables it", () => {
  assert.equal(loadEtsyConfig({ env }).publishEnabled, false);
  assert.equal(loadEtsyConfig({ env: { ...env, ETSY_PUBLISH_ENABLED: "yes" } }).publishEnabled, false);
  assert.equal(loadEtsyConfig({ env: { ...env, ETSY_PUBLISH_ENABLED: "true" } }).publishEnabled, true);
});

test("activateListing refuses without the server gate, with no request sent", async () => {
  const { s, fake } = service({}, []);
  await assert.rejects(s.activateListing({ shopId: 7, listingId: 55, confirmation: "ACTIVATE 55" }), EtsyPublishBlockedError);
  assert.equal(fake.calls.length, 0);
});

test("activateListing refuses a missing or mismatched confirmation, with no request sent", async () => {
  const { s, fake } = service({ ETSY_PUBLISH_ENABLED: "true" }, []);
  await assert.rejects(s.activateListing({ shopId: 7, listingId: 55, confirmation: "ACTIVATE 56" }), /explicit confirmation/);
  assert.equal(fake.calls.length, 0);
});

test("activateListing refuses a listing of another shop, an active listing or a physical listing (read only)", async () => {
  for (const [raw, re] of [[{ ...draft, shop_id: 8 }, /configured shop/], [{ ...draft, state: "active" }, /not a draft/], [{ ...draft, listing_type: "physical" }, /digital download/]] as const) {
    const { s, fake } = service({ ETSY_PUBLISH_ENABLED: "true" }, [{ body: raw }]);
    await assert.rejects(s.activateListing({ shopId: 7, listingId: 55, confirmation: "ACTIVATE 55" }), re);
    assert.deepEqual(fake.calls.map((c) => c.method), ["GET"]);
  }
});

test("activateListing, when every gate passes, sends exactly one PATCH state=active to the shop listing", async () => {
  const { s, fake } = service({ ETSY_PUBLISH_ENABLED: "true" }, [{ body: draft }, { body: { ...draft, state: "active" } }]);
  const r = await s.activateListing({ shopId: 7, listingId: 55, confirmation: "ACTIVATE 55" });
  assert.equal(r.state, "active");
  const patch = fake.calls[1]!;
  assert.equal(patch.method, "PATCH");
  assert.match(patch.url, /\/application\/shops\/7\/listings\/55$/);
  assert.equal(patch.body, "state=active");
  assert.equal(patch.headers["authorization"], "Bearer 12345.access");
});

test("updateListing can never activate a listing", async () => {
  const { s, fake } = service({ ETSY_PUBLISH_ENABLED: "true" }, []);
  await assert.rejects(s.updateListing({ shopId: 7, listingId: 55, state: "active" as unknown as "inactive" }), EtsyPublishBlockedError);
  assert.equal(fake.calls.length, 0);
});

test("createListing sends a form-encoded draft with type=download and no auto-renew", async () => {
  const { s, fake } = service({}, [{ body: draft }]);
  await s.createListing({ shopId: 7, title: "T", description: "D", priceAmount: 4.25, quantity: 999, whoMade: "i_did", whenMade: "made_to_order", taxonomyId: 1296, tags: ["a b"], materials: ["Digital PDF"] });
  const body = new URLSearchParams(fake.calls[0]!.body);
  assert.deepEqual([body.get("state"), body.get("type"), body.get("price"), body.get("should_auto_renew"), body.get("when_made")], ["draft", "download", "4.25", "false", "made_to_order"]);
  await assert.rejects(s.createListing({ shopId: 7, title: "T", description: "D", priceAmount: 1, quantity: 1, whoMade: "i_did", whenMade: "2020_2026", taxonomyId: 1, state: "active" as unknown as "draft" }), /Only drafts/);
});

test("listing properties: taxonomy properties, a listing's properties, and an idempotent PUT", async () => {
  const { s, fake } = service({}, [
    { body: { results: [{ property_id: 46803063641, name: "occasion", display_name: "Occasion", is_multivalued: false, possible_values: [{ value_id: 19, name: "Christmas" }] }] } },
    { body: { property_id: 46803063641, property_name: "Occasion", value_ids: [19], values: ["Christmas"] } },
    { body: { results: [{ property_id: 46803063641, property_name: "Occasion", value_ids: [19], values: ["Christmas"] }] } },
  ]);
  const props = await s.getPropertiesByTaxonomyId(1296);
  assert.deepEqual(props[0], { propertyId: 46803063641, name: "occasion", displayName: "Occasion", isMultivalued: false, possibleValues: [{ valueId: 19, name: "Christmas" }] });
  await s.updateListingProperty({ shopId: 7, listingId: 55, propertyId: 46803063641, valueIds: [19], values: ["Christmas"] });
  const list = await s.getListingProperties(7, 55);
  assert.equal(list[0]!.valueIds[0], 19);
  assert.match(fake.calls[0]!.url, /\/application\/seller-taxonomy\/nodes\/1296\/properties$/);
  assert.equal(fake.calls[1]!.method, "PUT");
  assert.match(fake.calls[1]!.url, /\/application\/shops\/7\/listings\/55\/properties\/46803063641$/);
  assert.equal(fake.calls[1]!.body, "value_ids=19&values=Christmas");
  assert.match(fake.calls[2]!.url, /\/application\/shops\/7\/listings\/55\/properties$/);
});

test("getShopByOwnerUserId: one read-only GET /users/{id}/shops, mapped to name + numeric ID", async () => {
  const shop = { shop_id: 12345678, shop_name: "LumiumX", user_id: 98765, currency_code: "GBP", is_vacation: false, listing_active_count: 0, digital_listing_count: 0, url: "https://www.etsy.com/shop/LumiumX" };
  for (const body of [shop, { count: 1, results: [shop] }]) {
    const { s, fake } = service({}, [{ body }]);
    const r = await s.getShopByOwnerUserId(98765);
    assert.deepEqual([r?.shopName, r?.shopId], ["LumiumX", 12345678]);
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0]!.method, "GET");
    assert.match(fake.calls[0]!.url, /\/application\/users\/98765\/shops$/);
    // Etsy requires the user's bearer token here (403 without it), though no scope.
    assert.equal(fake.calls[0]!.headers["authorization"], "Bearer 12345.access");
  }
  const { s } = service({}, [{ body: { count: 0, results: [] } }]);
  assert.equal(await s.getShopByOwnerUserId(98765), undefined);
});

test("getListing maps the fields Stage 4 verifies (materials, who/when made, shipping profile)", async () => {
  const { s } = service({}, [{ body: { ...draft, price: { amount: 425, divisor: 100, currency_code: "GBP" }, materials: ["Digital PDF"], who_made: "i_did", when_made: "made_to_order", shipping_profile_id: null, taxonomy_id: 1296, tags: ["a"] } }]);
  const l = await s.getListing(55);
  assert.deepEqual([l.priceAmount, l.priceCurrencyCode, l.materials, l.whoMade, l.whenMade, l.shippingProfileId, l.listingType], [4.25, "GBP", ["Digital PDF"], "i_did", "made_to_order", null, "download"]);
});

// Shop sections (ADR-054). Fake fetch only.
test("getShopSections reads the shop's sections (GET, mapped)", async () => {
  const { s, fake } = service({}, [{ body: { count: 2, results: [{ shop_section_id: 11, title: "Halloween", rank: 1, active_listing_count: 3 }, { shop_section_id: 12, title: "Christmas", rank: 2 }] } }]);
  const r = await s.getShopSections(7);
  assert.deepEqual(r, [{ shopSectionId: 11, title: "Halloween", rank: 1, activeListingCount: 3 }, { shopSectionId: 12, title: "Christmas", rank: 2 }]);
  assert.equal(fake.calls[0]!.method, "GET");
  assert.match(fake.calls[0]!.url, /\/application\/shops\/7\/sections$/);
});

test("createShopSection posts the title as a form body and returns the new section id", async () => {
  const { s, fake } = service({}, [{ body: { shop_section_id: 21, title: "Crochet Patterns", rank: 3 } }]);
  const r = await s.createShopSection({ shopId: 7, title: "Crochet Patterns" });
  assert.equal(r.shopSectionId, 21);
  assert.equal(fake.calls[0]!.method, "POST");
  assert.match(fake.calls[0]!.url, /\/application\/shops\/7\/sections$/);
  assert.equal(fake.calls[0]!.body, "title=Crochet+Patterns");
});

test("updateListing({shopSectionId}) sends only shop_section_id, never a state; the section is read back", async () => {
  const { s, fake } = service({}, [{ body: { ...draft, shop_section_id: 21 } }]);
  const r = await s.updateListing({ shopId: 7, listingId: 55, shopSectionId: 21 });
  assert.equal(r.shopSectionId, 21);
  assert.equal(fake.calls[0]!.method, "PATCH");
  assert.match(fake.calls[0]!.url, /\/application\/shops\/7\/listings\/55$/);
  assert.equal(fake.calls[0]!.body, "shop_section_id=21");
});

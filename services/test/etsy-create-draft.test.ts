import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createDraftFromListingSpec,
  type ListingSpec,
} from "../src/etsy/create-draft.ts";
import type { IEtsyService } from "../src/etsy/etsy-service.interface.ts";
import type {
  CreateDraftListingInput,
  EtsyListing,
  EtsyListingFile,
  EtsyListingImage,
  EtsyShop,
  UploadListingFileInput,
  UploadListingImageInput,
} from "../src/etsy/types.ts";

function shop(currency: string): EtsyShop {
  return {
    shopId: 42,
    shopName: "Test Shop",
    userId: 1,
    currencyCode: currency,
    isVacation: false,
    listingActiveCount: 0,
    digitalListingCount: 0,
    url: "https://etsy.com/shop/test",
  };
}

class FakeEtsy implements Partial<IEtsyService> {
  createCalls: CreateDraftListingInput[] = [];
  imageUploads: UploadListingImageInput[] = [];
  fileUploads: UploadListingFileInput[] = [];
  #shopCurrency: string;

  constructor(shopCurrency = "GBP") {
    this.#shopCurrency = shopCurrency;
  }

  async getMyShop(): Promise<EtsyShop> {
    return shop(this.#shopCurrency);
  }
  async createListing(input: CreateDraftListingInput): Promise<EtsyListing> {
    this.createCalls.push(input);
    return {
      listingId: 555,
      shopId: input.shopId,
      title: input.title,
      description: input.description,
      state: "draft",
      listingType: "download",
      priceAmount: input.priceAmount,
      priceCurrencyCode: this.#shopCurrency,
      quantity: input.quantity,
      taxonomyId: input.taxonomyId,
      tags: input.tags ?? [],
      url: "https://www.etsy.com/listing/555",
    };
  }
  async uploadListingImage(
    input: UploadListingImageInput,
  ): Promise<EtsyListingImage> {
    this.imageUploads.push(input);
    return { listingImageId: 900 + this.imageUploads.length, url: "u", rank: input.rank ?? 0 };
  }
  async uploadDigitalFile(
    input: UploadListingFileInput,
  ): Promise<EtsyListingFile> {
    this.fileUploads.push(input);
    return {
      listingFileId: 800 + this.fileUploads.length,
      fileName: input.fileName,
      rank: input.rank ?? 0,
    };
  }
}

const LISTING: ListingSpec = {
  productId: "001",
  currency: "GBP",
  price: 5.99,
  quantity: 999,
  whoMade: "i_did",
  whenMade: "2020_2025",
  listingType: "download",
  title: "Minimalist Monthly Budget Planner Printable",
  description: "An undated print-at-home budget system.",
  tags: ["budget planner", "monthly budget"],
  materials: ["PDF"],
  taxonomy: { taxonomyId: 1234 },
  images: [
    { path: "storage/products/001/listing/img-1.png", rank: 1, alt: "hero" },
    { path: "storage/products/001/listing/img-2.png", rank: 2 },
  ],
  files: [
    {
      path: "storage/products/001/final/minimalist-monthly-budget-planner-a4.pdf",
      name: "A4.pdf",
      rank: 1,
    },
    {
      path: "storage/products/001/final/minimalist-monthly-budget-planner-us-letter.pdf",
      name: "US-Letter.pdf",
      rank: 2,
    },
  ],
};

const readFake = async (p: string): Promise<Uint8Array> =>
  new Uint8Array([p.length & 0xff]);

test("APPROVE path uploads BOTH customer PDFs from storage and all listing images", async () => {
  const etsy = new FakeEtsy("GBP");
  const res = await createDraftFromListingSpec(
    etsy as unknown as IEtsyService,
    LISTING,
    { repoRoot: "/repo", readFileImpl: readFake },
  );

  assert.equal(res.state, "draft");
  assert.equal(res.filesUploaded, 2);
  assert.deepEqual(
    etsy.fileUploads.map((f) => f.fileName).sort(),
    ["A4.pdf", "US-Letter.pdf"],
  );
  assert.equal(res.imagesUploaded, 2);
  assert.equal(etsy.imageUploads.length, 2);
});

test("GBP price is sent verbatim to Etsy — 5.99, no conversion", async () => {
  const etsy = new FakeEtsy("GBP");
  await createDraftFromListingSpec(etsy as unknown as IEtsyService, LISTING, {
    repoRoot: "/repo",
    readFileImpl: readFake,
  });
  assert.equal(etsy.createCalls[0]!.priceAmount, 5.99);
});

test("currency mismatch is flagged but the amount is NOT converted", async () => {
  const etsy = new FakeEtsy("USD"); // shop is USD, listing.json says GBP
  const logs: string[] = [];
  const res = await createDraftFromListingSpec(
    etsy as unknown as IEtsyService,
    LISTING,
    { repoRoot: "/repo", readFileImpl: readFake, log: (l) => logs.push(l) },
  );

  assert.equal(res.currencyMismatch, true);
  assert.equal(res.listingCurrency, "GBP");
  assert.equal(res.shopCurrency, "USD");
  assert.equal(res.priceAmount, 5.99, "amount unchanged — no FX");
  assert.equal(etsy.createCalls[0]!.priceAmount, 5.99);
  assert.ok(logs.some((l) => /no FX/i.test(l)));
});

test("matching currency → no mismatch flag", async () => {
  const etsy = new FakeEtsy("GBP");
  const res = await createDraftFromListingSpec(
    etsy as unknown as IEtsyService,
    LISTING,
    { repoRoot: "/repo", readFileImpl: readFake },
  );
  assert.equal(res.currencyMismatch, false);
  assert.equal(res.shopCurrency, "GBP");
});

test("always creates in draft state — never publishes", async () => {
  const etsy = new FakeEtsy("GBP");
  await createDraftFromListingSpec(etsy as unknown as IEtsyService, LISTING, {
    repoRoot: "/repo",
    readFileImpl: readFake,
  });
  assert.equal(etsy.createCalls[0]!.state, "draft");
});

test("--dry-run resolves shop + currency but sends nothing", async () => {
  const etsy = new FakeEtsy("GBP");
  const res = await createDraftFromListingSpec(
    etsy as unknown as IEtsyService,
    LISTING,
    { repoRoot: "/repo", readFileImpl: readFake, dryRun: true },
  );
  assert.equal(res.dryRun, true);
  assert.equal(etsy.createCalls.length, 0);
  assert.equal(etsy.fileUploads.length, 0);
  assert.equal(etsy.imageUploads.length, 0);
  assert.equal(res.shopCurrency, "GBP");
  assert.equal(res.priceAmount, 5.99);
});

import { describe, it, expect, vi } from "vitest";
import {
  wikiImageUrl,
  buildBucketQueryUrl,
  mapWikiItemToItemRow,
  filterWikiItemIndex,
  fetchBucketPage,
  loadWikiItemIndex,
  EQUIPMENT_SLOTS,
  slotBucketFor,
  groupBySlotBucket,
} from "./wikiItems.js";

describe("wikiImageUrl", () => {
  it("strips the File: prefix and replaces spaces with underscores", () => {
    expect(wikiImageUrl("File:Twisted bow.png")).toBe(
      "https://oldschool.runescape.wiki/w/Special:FilePath/Twisted_bow.png"
    );
  });

  it("returns null for a missing image", () => {
    expect(wikiImageUrl(null)).toBe(null);
    expect(wikiImageUrl(undefined)).toBe(null);
  });
});

describe("buildBucketQueryUrl", () => {
  function queryParamOf(url) {
    return new URL(url).searchParams.get("query");
  }

  it("hits the bucket action endpoint with format/origin set for CORS", () => {
    const url = new URL(buildBucketQueryUrl({ bucket: "infobox_item", select: ["page_name"] }));
    expect(url.origin + url.pathname).toBe("https://oldschool.runescape.wiki/api.php");
    expect(url.searchParams.get("action")).toBe("bucket");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("origin")).toBe("*");
  });

  it("builds a select-only query", () => {
    const url = buildBucketQueryUrl({ bucket: "infobox_item", select: ["page_name", "item_id"] });
    expect(queryParamOf(url)).toBe("bucket('infobox_item').select('page_name','item_id').run()");
  });

  it("adds an exact-match where clause", () => {
    const url = buildBucketQueryUrl({
      bucket: "infobox_item",
      select: ["page_name"],
      where: ["page_name", "Twisted bow"],
    });
    expect(queryParamOf(url)).toBe("bucket('infobox_item').select('page_name').where('page_name','Twisted bow').run()");
  });

  it("adds limit and offset for pagination", () => {
    const url = buildBucketQueryUrl({ bucket: "infobox_item", select: ["page_name"], limit: 5000, offset: 5000 });
    expect(queryParamOf(url)).toBe("bucket('infobox_item').select('page_name').limit(5000).offset(5000).run()");
  });
});

describe("mapWikiItemToItemRow", () => {
  const twistedBow = {
    page_name: "Twisted bow",
    item_id: [20997],
    // The Bucket API always returns image as an array (even for a single
    // image — e.g. Coins has 10 for its denominations); confirmed live.
    image: ["File:Twisted bow.png"],
    examine: "A mystical bow carved from the twisted remains of the Great Olm.",
  };

  it("maps name/photo/wikiPageName, and equipmentSlot from the matching bonuses row", () => {
    const bonusesByPageName = { "Twisted bow": { equipment_slot: "2h" } };

    expect(mapWikiItemToItemRow(twistedBow, bonusesByPageName)).toEqual({
      name: "Twisted bow",
      photoUrl: "https://oldschool.runescape.wiki/w/Special:FilePath/Twisted_bow.png",
      equipmentSlot: "2h",
      wikiPageName: "Twisted bow",
    });
  });

  it("leaves equipmentSlot null when the item has no bonuses row (not equipable)", () => {
    const bonusesByPageName = {};

    expect(mapWikiItemToItemRow(twistedBow, bonusesByPageName)).toEqual({
      name: "Twisted bow",
      photoUrl: "https://oldschool.runescape.wiki/w/Special:FilePath/Twisted_bow.png",
      equipmentSlot: null,
      wikiPageName: "Twisted bow",
    });
  });

  it("uses the first image when an item has several (e.g. Coins' per-denomination icons)", () => {
    const coins = { page_name: "Coins", item_id: [995], image: ["File:Coins 1.png", "File:Coins 2.png", "File:Coins 3.png"] };

    expect(mapWikiItemToItemRow(coins, {}).photoUrl).toBe("https://oldschool.runescape.wiki/w/Special:FilePath/Coins_1.png");
  });

  it("leaves photoUrl null when an item has no image at all", () => {
    const noImage = { page_name: "Mystery item", item_id: [1], image: [] };

    expect(mapWikiItemToItemRow(noImage, {}).photoUrl).toBe(null);
  });
});

describe("filterWikiItemIndex", () => {
  const index = [
    { name: "Twisted bow", wikiPageName: "Twisted bow" },
    { name: "Twisted buckler", wikiPageName: "Twisted buckler" },
    { name: "Abyssal whip", wikiPageName: "Abyssal whip" },
  ];

  it("matches case-insensitively on a substring anywhere in the name", () => {
    expect(filterWikiItemIndex(index, "twisted")).toEqual([index[0], index[1]]);
    expect(filterWikiItemIndex(index, "BOW")).toEqual([index[0]]);
  });

  it("returns the full index for an empty or whitespace-only query", () => {
    expect(filterWikiItemIndex(index, "")).toEqual(index);
    expect(filterWikiItemIndex(index, "   ")).toEqual(index);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterWikiItemIndex(index, "dragon claws")).toEqual([]);
  });
});

describe("fetchBucketPage", () => {
  it("requests the built URL and returns the bucket array", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ bucket: [{ page_name: "Twisted bow" }] }),
    });

    const rows = await fetchBucketPage(fakeFetch, { bucket: "infobox_item", select: ["page_name"], limit: 5000, offset: 0 });

    expect(rows).toEqual([{ page_name: "Twisted bow" }]);
    expect(fakeFetch).toHaveBeenCalledWith(
      buildBucketQueryUrl({ bucket: "infobox_item", select: ["page_name"], limit: 5000, offset: 0 })
    );
  });

  it("throws when the API responds with an error", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: "Field foo not found in bucket infobox_item." }),
    });

    await expect(
      fetchBucketPage(fakeFetch, { bucket: "infobox_item", select: ["foo"], limit: 5000, offset: 0 })
    ).rejects.toThrow("Field foo not found in bucket infobox_item.");
  });
});

describe("loadWikiItemIndex", () => {
  it("pages through infobox_item and infobox_bonuses, joins on page_name, and maps every item", async () => {
    // First page of infobox_item is a full page (forces a second, shorter
    // page to be fetched); infobox_bonuses fits in one page.
    const itemPage0 = Array.from({ length: 2 }, (_, i) => ({
      page_name: `Item ${i}`,
      item_id: [i],
      image: [`File:Item ${i}.png`],
    }));
    const itemPage1 = [{ page_name: "Twisted bow", item_id: [20997], image: ["File:Twisted bow.png"] }];
    const bonusesPage0 = [{ page_name: "Twisted bow", equipment_slot: "2h" }];

    const fakeFetch = vi.fn((url) => {
      const params = new URL(url).searchParams.get("query");
      let bucket;
      if (params.startsWith("bucket('infobox_item')")) bucket = "infobox_item";
      else bucket = "infobox_bonuses";

      const offset = Number(params.match(/\.offset\((\d+)\)/)?.[1] ?? 0);

      if (bucket === "infobox_item") {
        return Promise.resolve({ json: () => Promise.resolve({ bucket: offset === 0 ? itemPage0 : itemPage1 }) });
      }
      return Promise.resolve({ json: () => Promise.resolve({ bucket: offset === 0 ? bonusesPage0 : [] }) });
    });

    const index = await loadWikiItemIndex(fakeFetch, { pageSize: 2 });

    expect(index).toEqual([
      { name: "Item 0", photoUrl: "https://oldschool.runescape.wiki/w/Special:FilePath/Item_0.png", equipmentSlot: null, wikiPageName: "Item 0" },
      { name: "Item 1", photoUrl: "https://oldschool.runescape.wiki/w/Special:FilePath/Item_1.png", equipmentSlot: null, wikiPageName: "Item 1" },
      { name: "Twisted bow", photoUrl: "https://oldschool.runescape.wiki/w/Special:FilePath/Twisted_bow.png", equipmentSlot: "2h", wikiPageName: "Twisted bow" },
    ]);
  });
});

describe("slotBucketFor", () => {
  it("returns known equipment slots as-is", () => {
    for (const slot of EQUIPMENT_SLOTS) {
      expect(slotBucketFor(slot)).toBe(slot);
    }
  });

  it("collapses 2h into the weapon bucket (displayed with a badge, not a merged cell)", () => {
    expect(slotBucketFor("2h")).toBe("weapon");
  });

  it("buckets null, undefined, and any unrecognized value as other", () => {
    expect(slotBucketFor(null)).toBe("other");
    expect(slotBucketFor(undefined)).toBe("other");
    expect(slotBucketFor("some_future_slot_we_dont_know_about")).toBe("other");
  });
});

describe("groupBySlotBucket", () => {
  it("groups items into buckets by the accessor-provided slot value", () => {
    const items = [
      { name: "Rune full helm", equipment_slot: "head" },
      { name: "Twisted bow", equipment_slot: "2h" },
      { name: "Dragon defender", equipment_slot: "shield" },
      { name: "Zulrah's scales", equipment_slot: null },
    ];

    const grouped = groupBySlotBucket(items, (i) => i.equipment_slot);

    expect(grouped.head).toEqual([items[0]]);
    expect(grouped.weapon).toEqual([items[1]]);
    expect(grouped.shield).toEqual([items[2]]);
    expect(grouped.other).toEqual([items[3]]);
    expect(grouped.cape).toEqual([]);
  });

  it("works with a camelCase accessor too (e.g. live search results)", () => {
    const results = [{ name: "Abyssal whip", equipmentSlot: "weapon" }];
    const grouped = groupBySlotBucket(results, (r) => r.equipmentSlot);
    expect(grouped.weapon).toEqual([results[0]]);
  });

  it("every known slot plus other is always present, even when empty", () => {
    const grouped = groupBySlotBucket([], () => null);
    expect(Object.keys(grouped).sort()).toEqual([...EQUIPMENT_SLOTS, "other"].sort());
  });
});

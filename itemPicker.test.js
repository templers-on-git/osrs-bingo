import { describe, it, expect, vi } from "vitest";
import { searchLocalItems, getOrCreateItemFromWiki } from "./admin.js";
import { searchPickableItems, resolvePickedItem } from "./itemPicker.js";

vi.mock("./admin.js", () => ({
  searchLocalItems: vi.fn(),
  getOrCreateItemFromWiki: vi.fn(),
}));

describe("searchPickableItems", () => {
  const wikiIndex = [
    { name: "Twisted bow", photoUrl: "https://wiki/tbow.png", equipmentSlot: "2h", wikiPageName: "Twisted bow" },
    { name: "Twisted buckler", photoUrl: "https://wiki/buckler.png", equipmentSlot: "shield", wikiPageName: "Twisted buckler" },
  ];
  const fakeSupabase = {};

  it("returns an empty array for an empty query without hitting the DB", async () => {
    const result = await searchPickableItems(fakeSupabase, wikiIndex, "   ");

    expect(result).toEqual([]);
    expect(searchLocalItems).not.toHaveBeenCalled();
  });

  it("merges local and wiki results, normalizing to a common shape, and dedupes an already-cached wiki item", async () => {
    searchLocalItems.mockResolvedValue([
      {
        id: "item-1",
        name: "Twisted buckler",
        photo_url: "https://cached/buckler.png",
        equipment_slot: "shield",
        wiki_page_name: "Twisted buckler",
      },
    ]);

    const result = await searchPickableItems(fakeSupabase, wikiIndex, "twisted");

    expect(searchLocalItems).toHaveBeenCalledWith(fakeSupabase, "twisted");
    // The cached local copy of "Twisted buckler" is returned...
    expect(result).toContainEqual({
      source: "local",
      id: "item-1",
      name: "Twisted buckler",
      photoUrl: "https://cached/buckler.png",
      equipmentSlot: "shield",
      wikiPageName: "Twisted buckler",
    });
    // ...and the wiki's own "Twisted buckler" entry is deduped out (already cached) —
    // only the local copy above should represent it.
    expect(result.filter((r) => r.wikiPageName === "Twisted buckler")).toHaveLength(1);
    // "Twisted bow" has no local copy, so the wiki result passes through as-is.
    expect(result).toContainEqual({
      source: "wiki",
      id: null,
      name: "Twisted bow",
      photoUrl: "https://wiki/tbow.png",
      equipmentSlot: "2h",
      wikiPageName: "Twisted bow",
    });
  });
});

describe("resolvePickedItem", () => {
  const fakeSupabase = {};

  it("passes a local pick straight through as a normalized DB row", async () => {
    const picked = {
      source: "local",
      id: "item-1",
      name: "Twisted buckler",
      photoUrl: "https://cached/buckler.png",
      equipmentSlot: "shield",
      wikiPageName: "Twisted buckler",
    };

    const result = await resolvePickedItem(fakeSupabase, picked);

    expect(getOrCreateItemFromWiki).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: "item-1",
      name: "Twisted buckler",
      photo_url: "https://cached/buckler.png",
      equipment_slot: "shield",
      wiki_page_name: "Twisted buckler",
    });
  });

  it("caches a wiki pick via getOrCreateItemFromWiki", async () => {
    const cachedRow = {
      id: "item-2",
      name: "Twisted bow",
      photo_url: "https://wiki/tbow.png",
      equipment_slot: "2h",
      wiki_page_name: "Twisted bow",
    };
    getOrCreateItemFromWiki.mockResolvedValue(cachedRow);
    const picked = { source: "wiki", id: null, name: "Twisted bow", photoUrl: "https://wiki/tbow.png", equipmentSlot: "2h", wikiPageName: "Twisted bow" };

    const result = await resolvePickedItem(fakeSupabase, picked);

    expect(getOrCreateItemFromWiki).toHaveBeenCalledWith(fakeSupabase, {
      name: "Twisted bow",
      photoUrl: "https://wiki/tbow.png",
      equipmentSlot: "2h",
      wikiPageName: "Twisted bow",
    });
    expect(result).toEqual(cachedRow);
  });
});

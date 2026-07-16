import { describe, it, expect, vi } from "vitest";
import {
  isTileComplete,
  getTileProgress,
  markTileComplete,
  unmarkTileComplete,
  incrementTileProgress,
  collectItemForTile,
  uncollectItemForTile,
  listClanTileProgress,
} from "./tileProgress.js";

function fakeReadThenWrite(existingRow, updatedRow) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: existingRow, error: null });
  const eq2 = vi.fn(() => ({ maybeSingle }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));

  const single = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
  const upsertSelect = vi.fn(() => ({ single }));
  const upsert = vi.fn(() => ({ select: upsertSelect }));

  const from = vi.fn(() => ({ select, upsert }));
  return { fakeSupabase: { from }, upsert };
}

describe("isTileComplete", () => {
  describe("complete_once", () => {
    it("is complete when progress.completed is true", () => {
      const tile = { tileType: "complete_once", config: {} };
      const progress = { completed: true };

      expect(isTileComplete(tile, progress)).toBe(true);
    });

    it("is not complete when progress.completed is false", () => {
      const tile = { tileType: "complete_once", config: {} };
      const progress = { completed: false };

      expect(isTileComplete(tile, progress)).toBe(false);
    });
  });

  describe("complete_x_times", () => {
    it("is not complete when currentCount is below target", () => {
      const tile = { tileType: "complete_x_times", config: { target: 5 } };
      const progress = { currentCount: 4 };

      expect(isTileComplete(tile, progress)).toBe(false);
    });

    it("is complete when currentCount reaches target", () => {
      const tile = { tileType: "complete_x_times", config: { target: 5 } };
      const progress = { currentCount: 5 };

      expect(isTileComplete(tile, progress)).toBe(true);
    });

    it("is complete when currentCount exceeds target", () => {
      const tile = { tileType: "complete_x_times", config: { target: 5 } };
      const progress = { currentCount: 6 };

      expect(isTileComplete(tile, progress)).toBe(true);
    });
  });

  describe("collect_one_of_each", () => {
    it("is not complete when at least one required item is missing", () => {
      const tile = { tileType: "collect_one_of_each", config: { itemIds: ["item-1", "item-2", "item-3"] } };
      const progress = { collectedItemIds: ["item-1", "item-2"] };

      expect(isTileComplete(tile, progress)).toBe(false);
    });

    it("is complete when every required item has been collected", () => {
      const tile = { tileType: "collect_one_of_each", config: { itemIds: ["item-1", "item-2", "item-3"] } };
      const progress = { collectedItemIds: ["item-1", "item-2", "item-3"] };

      expect(isTileComplete(tile, progress)).toBe(true);
    });
  });

  describe("collect_k_of_y", () => {
    it("is not complete when fewer than k distinct items are collected", () => {
      const tile = { tileType: "collect_k_of_y", config: { itemIds: ["item-1", "item-2", "item-3"], k: 2 } };
      const progress = { collectedItemIds: ["item-1"] };

      expect(isTileComplete(tile, progress)).toBe(false);
    });

    it("is complete when exactly k distinct items are collected", () => {
      const tile = { tileType: "collect_k_of_y", config: { itemIds: ["item-1", "item-2", "item-3"], k: 2 } };
      const progress = { collectedItemIds: ["item-1", "item-2"] };

      expect(isTileComplete(tile, progress)).toBe(true);
    });

    it("only counts collected items that are actually part of this tile's item set", () => {
      const tile = { tileType: "collect_k_of_y", config: { itemIds: ["item-1", "item-2", "item-3"], k: 2 } };
      const progress = { collectedItemIds: ["item-1", "item-from-a-different-tile"] };

      expect(isTileComplete(tile, progress)).toBe(false);
    });
  });

  describe("n_sets", () => {
    const itemsBySet = {
      "set-1": ["item-1", "item-2"],
      "set-2": ["item-3", "item-4"],
    };

    describe("mode: full_set", () => {
      it("is not complete when no single set is fully collected", () => {
        const tile = { tileType: "n_sets", config: { setIds: ["set-1", "set-2"], mode: "full_set" } };
        const progress = { collectedItemIds: ["item-1", "item-3"] };

        expect(isTileComplete(tile, progress, itemsBySet)).toBe(false);
      });

      it("is complete when at least one whole set has been collected", () => {
        const tile = { tileType: "n_sets", config: { setIds: ["set-1", "set-2"], mode: "full_set" } };
        const progress = { collectedItemIds: ["item-1", "item-2"] };

        expect(isTileComplete(tile, progress, itemsBySet)).toBe(true);
      });
    });

    describe("mode: one_of_each", () => {
      it("is not complete when a set has zero items collected", () => {
        const tile = { tileType: "n_sets", config: { setIds: ["set-1", "set-2"], mode: "one_of_each" } };
        const progress = { collectedItemIds: ["item-1", "item-2"] };

        expect(isTileComplete(tile, progress, itemsBySet)).toBe(false);
      });

      it("is complete when every set has at least one item collected", () => {
        const tile = { tileType: "n_sets", config: { setIds: ["set-1", "set-2"], mode: "one_of_each" } };
        const progress = { collectedItemIds: ["item-1", "item-3"] };

        expect(isTileComplete(tile, progress, itemsBySet)).toBe(true);
      });
    });

    describe("mode: either", () => {
      it("is not complete when neither condition is met", () => {
        const tile = { tileType: "n_sets", config: { setIds: ["set-1", "set-2"], mode: "either" } };
        const progress = { collectedItemIds: ["item-1"] };

        expect(isTileComplete(tile, progress, itemsBySet)).toBe(false);
      });

      it("is complete via full_set alone", () => {
        const tile = { tileType: "n_sets", config: { setIds: ["set-1", "set-2"], mode: "either" } };
        const progress = { collectedItemIds: ["item-1", "item-2"] };

        expect(isTileComplete(tile, progress, itemsBySet)).toBe(true);
      });

      it("is complete via one_of_each alone", () => {
        const tile = { tileType: "n_sets", config: { setIds: ["set-1", "set-2"], mode: "either" } };
        const progress = { collectedItemIds: ["item-1", "item-3"] };

        expect(isTileComplete(tile, progress, itemsBySet)).toBe(true);
      });
    });
  });
});

describe("getTileProgress", () => {
  it("returns the existing row, camelCased", async () => {
    const row = {
      tile_id: "tile-1",
      clan_id: "clan-1",
      current_count: 3,
      collected_item_ids: ["item-1"],
      completed: false,
      completed_at: null,
    };
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const eq2 = vi.fn(() => ({ maybeSingle }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ select }));
    const fakeSupabase = { from };

    const progress = await getTileProgress(fakeSupabase, "tile-1", "clan-1");

    expect(from).toHaveBeenCalledWith("tile_progress");
    expect(eq1).toHaveBeenCalledWith("tile_id", "tile-1");
    expect(eq2).toHaveBeenCalledWith("clan_id", "clan-1");
    expect(progress).toEqual({
      tileId: "tile-1",
      clanId: "clan-1",
      currentCount: 3,
      collectedItemIds: ["item-1"],
      completed: false,
      completedAt: null,
    });
  });

  it("returns a zeroed default when no row exists yet", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq2 = vi.fn(() => ({ maybeSingle }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ select }));
    const fakeSupabase = { from };

    const progress = await getTileProgress(fakeSupabase, "tile-1", "clan-1");

    expect(progress).toEqual({
      tileId: "tile-1",
      clanId: "clan-1",
      currentCount: 0,
      collectedItemIds: [],
      completed: false,
      completedAt: null,
    });
  });
});

describe("markTileComplete", () => {
  it("upserts the tile_progress row as completed", async () => {
    const updatedRow = {
      tile_id: "tile-1",
      clan_id: "clan-1",
      current_count: 0,
      collected_item_ids: [],
      completed: true,
      completed_at: "2026-07-15T12:00:00.000Z",
    };
    const single = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
    const select = vi.fn(() => ({ single }));
    const upsert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ upsert }));
    const fakeSupabase = { from };

    const progress = await markTileComplete(fakeSupabase, "tile-1", "clan-1");

    expect(from).toHaveBeenCalledWith("tile_progress");
    expect(upsert).toHaveBeenCalledWith(
      { tile_id: "tile-1", clan_id: "clan-1", completed: true, completed_at: expect.any(String) },
      { onConflict: "tile_id,clan_id" },
    );
    expect(progress).toEqual({
      tileId: "tile-1",
      clanId: "clan-1",
      currentCount: 0,
      collectedItemIds: [],
      completed: true,
      completedAt: "2026-07-15T12:00:00.000Z",
    });
  });
});

describe("unmarkTileComplete", () => {
  it("upserts the tile_progress row as not completed", async () => {
    const updatedRow = {
      tile_id: "tile-1",
      clan_id: "clan-1",
      current_count: 0,
      collected_item_ids: [],
      completed: false,
      completed_at: null,
    };
    const single = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
    const select = vi.fn(() => ({ single }));
    const upsert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ upsert }));
    const fakeSupabase = { from };

    const progress = await unmarkTileComplete(fakeSupabase, "tile-1", "clan-1");

    expect(from).toHaveBeenCalledWith("tile_progress");
    expect(upsert).toHaveBeenCalledWith(
      { tile_id: "tile-1", clan_id: "clan-1", completed: false, completed_at: null },
      { onConflict: "tile_id,clan_id" },
    );
    expect(progress.completed).toBe(false);
  });
});

describe("incrementTileProgress", () => {
  const tile = { id: "tile-1", tileType: "complete_x_times", config: { target: 5 } };

  it("increments current_count by 1 but stays incomplete when still below target", async () => {
    const existingRow = {
      tile_id: "tile-1",
      clan_id: "clan-1",
      current_count: 2,
      collected_item_ids: [],
      completed: false,
      completed_at: null,
    };
    const updatedRow = { ...existingRow, current_count: 3 };
    const { fakeSupabase, upsert } = fakeReadThenWrite(existingRow, updatedRow);

    const progress = await incrementTileProgress(fakeSupabase, tile, "clan-1");

    expect(upsert).toHaveBeenCalledWith(
      { tile_id: "tile-1", clan_id: "clan-1", current_count: 3, completed: false, completed_at: null },
      { onConflict: "tile_id,clan_id" },
    );
    expect(progress.currentCount).toBe(3);
    expect(progress.completed).toBe(false);
  });

  it("marks the tile completed once current_count reaches target", async () => {
    const existingRow = {
      tile_id: "tile-1",
      clan_id: "clan-1",
      current_count: 4,
      collected_item_ids: [],
      completed: false,
      completed_at: null,
    };
    const updatedRow = { ...existingRow, current_count: 5, completed: true, completed_at: "2026-07-15T12:00:00.000Z" };
    const { fakeSupabase, upsert } = fakeReadThenWrite(existingRow, updatedRow);

    const progress = await incrementTileProgress(fakeSupabase, tile, "clan-1");

    expect(upsert).toHaveBeenCalledWith(
      { tile_id: "tile-1", clan_id: "clan-1", current_count: 5, completed: true, completed_at: expect.any(String) },
      { onConflict: "tile_id,clan_id" },
    );
    expect(progress.currentCount).toBe(5);
    expect(progress.completed).toBe(true);
  });

  it("clamps current_count at 0 instead of going negative", async () => {
    const existingRow = {
      tile_id: "tile-1",
      clan_id: "clan-1",
      current_count: 0,
      collected_item_ids: [],
      completed: false,
      completed_at: null,
    };
    const updatedRow = { ...existingRow, current_count: 0 };
    const { fakeSupabase, upsert } = fakeReadThenWrite(existingRow, updatedRow);

    const progress = await incrementTileProgress(fakeSupabase, tile, "clan-1", -1);

    expect(upsert).toHaveBeenCalledWith(
      { tile_id: "tile-1", clan_id: "clan-1", current_count: 0, completed: false, completed_at: null },
      { onConflict: "tile_id,clan_id" },
    );
    expect(progress.currentCount).toBe(0);
  });
});

describe("collectItemForTile", () => {
  const tile = { id: "tile-1", tileType: "collect_one_of_each", config: { itemIds: ["item-1", "item-2"] } };

  it("adds the item and stays incomplete when other required items are still missing", async () => {
    const existingRow = {
      tile_id: "tile-1",
      clan_id: "clan-1",
      current_count: 0,
      collected_item_ids: [],
      completed: false,
      completed_at: null,
    };
    const updatedRow = { ...existingRow, collected_item_ids: ["item-1"] };
    const { fakeSupabase, upsert } = fakeReadThenWrite(existingRow, updatedRow);

    const progress = await collectItemForTile(fakeSupabase, tile, "clan-1", "item-1");

    expect(upsert).toHaveBeenCalledWith(
      { tile_id: "tile-1", clan_id: "clan-1", collected_item_ids: ["item-1"], completed: false, completed_at: null },
      { onConflict: "tile_id,clan_id" },
    );
    expect(progress.collectedItemIds).toEqual(["item-1"]);
    expect(progress.completed).toBe(false);
  });

  it("marks the tile completed once the last required item is collected", async () => {
    const existingRow = {
      tile_id: "tile-1",
      clan_id: "clan-1",
      current_count: 0,
      collected_item_ids: ["item-1"],
      completed: false,
      completed_at: null,
    };
    const updatedRow = {
      ...existingRow,
      collected_item_ids: ["item-1", "item-2"],
      completed: true,
      completed_at: "2026-07-15T12:00:00.000Z",
    };
    const { fakeSupabase, upsert } = fakeReadThenWrite(existingRow, updatedRow);

    const progress = await collectItemForTile(fakeSupabase, tile, "clan-1", "item-2");

    expect(upsert).toHaveBeenCalledWith(
      {
        tile_id: "tile-1",
        clan_id: "clan-1",
        collected_item_ids: ["item-1", "item-2"],
        completed: true,
        completed_at: expect.any(String),
      },
      { onConflict: "tile_id,clan_id" },
    );
    expect(progress.completed).toBe(true);
  });

  it("does not duplicate an item that was already collected", async () => {
    const existingRow = {
      tile_id: "tile-1",
      clan_id: "clan-1",
      current_count: 0,
      collected_item_ids: ["item-1"],
      completed: false,
      completed_at: null,
    };
    const updatedRow = { ...existingRow };
    const { fakeSupabase, upsert } = fakeReadThenWrite(existingRow, updatedRow);

    await collectItemForTile(fakeSupabase, tile, "clan-1", "item-1");

    expect(upsert).toHaveBeenCalledWith(
      { tile_id: "tile-1", clan_id: "clan-1", collected_item_ids: ["item-1"], completed: false, completed_at: null },
      { onConflict: "tile_id,clan_id" },
    );
  });
});

describe("uncollectItemForTile", () => {
  const tile = { id: "tile-1", tileType: "collect_one_of_each", config: { itemIds: ["item-1", "item-2"] } };

  it("removes the item and reverts to incomplete if it was previously the last one needed", async () => {
    const existingRow = {
      tile_id: "tile-1",
      clan_id: "clan-1",
      current_count: 0,
      collected_item_ids: ["item-1", "item-2"],
      completed: true,
      completed_at: "2026-07-15T12:00:00.000Z",
    };
    const updatedRow = { ...existingRow, collected_item_ids: ["item-1"], completed: false, completed_at: null };
    const { fakeSupabase, upsert } = fakeReadThenWrite(existingRow, updatedRow);

    const progress = await uncollectItemForTile(fakeSupabase, tile, "clan-1", "item-2");

    expect(upsert).toHaveBeenCalledWith(
      { tile_id: "tile-1", clan_id: "clan-1", collected_item_ids: ["item-1"], completed: false, completed_at: null },
      { onConflict: "tile_id,clan_id" },
    );
    expect(progress.collectedItemIds).toEqual(["item-1"]);
    expect(progress.completed).toBe(false);
  });

  it("does nothing destructive when removing an item that was never collected", async () => {
    const existingRow = {
      tile_id: "tile-1",
      clan_id: "clan-1",
      current_count: 0,
      collected_item_ids: ["item-1"],
      completed: false,
      completed_at: null,
    };
    const updatedRow = { ...existingRow };
    const { fakeSupabase, upsert } = fakeReadThenWrite(existingRow, updatedRow);

    await uncollectItemForTile(fakeSupabase, tile, "clan-1", "item-2");

    expect(upsert).toHaveBeenCalledWith(
      { tile_id: "tile-1", clan_id: "clan-1", collected_item_ids: ["item-1"], completed: false, completed_at: null },
      { onConflict: "tile_id,clan_id" },
    );
  });
});

describe("listClanTileProgress", () => {
  it("selects every tile_progress row for the given clan, camelCased", async () => {
    const rows = [
      {
        tile_id: "tile-1",
        clan_id: "clan-1",
        current_count: 3,
        collected_item_ids: [],
        completed: false,
        completed_at: null,
      },
      {
        tile_id: "tile-2",
        clan_id: "clan-1",
        current_count: 0,
        collected_item_ids: ["item-1"],
        completed: true,
        completed_at: "2026-07-15T12:00:00.000Z",
      },
    ];
    const eq = vi.fn().mockResolvedValue({ data: rows, error: null });
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const fakeSupabase = { from };

    const result = await listClanTileProgress(fakeSupabase, "clan-1");

    expect(from).toHaveBeenCalledWith("tile_progress");
    expect(eq).toHaveBeenCalledWith("clan_id", "clan-1");
    expect(result).toEqual([
      { tileId: "tile-1", clanId: "clan-1", currentCount: 3, collectedItemIds: [], completed: false, completedAt: null },
      {
        tileId: "tile-2",
        clanId: "clan-1",
        currentCount: 0,
        collectedItemIds: ["item-1"],
        completed: true,
        completedAt: "2026-07-15T12:00:00.000Z",
      },
    ]);
  });
});

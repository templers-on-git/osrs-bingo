import { describe, it, expect, vi } from "vitest";
import {
  createEvent,
  listEvents,
  getEvent,
  listEventClans,
  deleteEvent,
  setEventStatus,
  updateEventEndTime,
  updateEventStartTime,
  getClanLeaderboard,
  createClan,
  assignClanToEvent,
  listClans,
  deleteClan,
  updateClan,
  regenerateClanPassword,
  elevateToDev,
  actAsClan,
  createBracket,
  listBrackets,
  updateBracket,
  deleteBracket,
  createTile,
  listTiles,
  updateTile,
  deleteTile,
  createItem,
  listItems,
  updateItem,
  deleteItem,
  createItemSet,
  listItemSets,
  updateItemSet,
  deleteItemSet,
  addItemToSet,
  removeItemFromSet,
  listItemsInSet,
  listItemsByIds,
  searchLocalItems,
  getOrCreateItemFromWiki,
} from "./admin.js";

describe("createEvent", () => {
  it("inserts a draft event and returns it", async () => {
    const insertedRow = {
      id: "event-1",
      name: "Winter ToA Bingo",
      status: "draft",
      end_time_utc: "2026-08-01T00:00:00Z",
    };

    // A fake Supabase client shaped like the real one: .from().insert().select().single()
    // resolves to { data, error }, same as the real supabase-js client would.
    const single = vi.fn().mockResolvedValue({ data: insertedRow, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    const fakeSupabase = { from };

    const event = await createEvent(fakeSupabase, {
      name: "Winter ToA Bingo",
      endTimeUtc: "2026-08-01T00:00:00Z",
    });

    expect(from).toHaveBeenCalledWith("events");
    expect(insert).toHaveBeenCalledWith({
      name: "Winter ToA Bingo",
      end_time_utc: "2026-08-01T00:00:00Z",
    });
    expect(event).toEqual(insertedRow);
  });
});

describe("listEvents", () => {
  it("selects all events", async () => {
    const events = [{ id: "event-1", name: "Winter ToA Bingo", status: "draft" }];
    const select = vi.fn().mockResolvedValue({ data: events, error: null });
    const from = vi.fn(() => ({ select }));
    const fakeSupabase = { from };

    const result = await listEvents(fakeSupabase);

    expect(from).toHaveBeenCalledWith("events");
    expect(result).toEqual(events);
  });
});

describe("getEvent", () => {
  it("selects a single event by id", async () => {
    const event = { id: "event-1", name: "Winter ToA Bingo", status: "published" };
    const single = vi.fn().mockResolvedValue({ data: event, error: null });
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const fakeSupabase = { from };

    const result = await getEvent(fakeSupabase, "event-1");

    expect(from).toHaveBeenCalledWith("events");
    expect(eq).toHaveBeenCalledWith("id", "event-1");
    expect(result).toEqual(event);
  });
});

describe("listEventClans", () => {
  it("calls list_clans for the given event and returns safe clan fields", async () => {
    const clans = [
      { clan_id: "clan-1", display_name: "Iron Foundry", is_shadow: false, shadow_score: null },
    ];
    const rpc = vi.fn().mockResolvedValue({ data: clans, error: null });
    const fakeSupabase = { rpc };

    const result = await listEventClans(fakeSupabase, "event-1");

    expect(rpc).toHaveBeenCalledWith("list_clans", { p_event_id: "event-1" });
    expect(result).toEqual([
      { clanId: "clan-1", displayName: "Iron Foundry", isShadow: false, shadowScore: null },
    ]);
  });
});

describe("createClan", () => {
  it("calls create_clan (no event_id) and returns the new clan's id and passwords", async () => {
    // create_clan is a Postgres function (an "RPC"), not a table insert, so the
    // fake client shape is .rpc(name, args).single() instead of .from().insert()...
    const single = vi.fn().mockResolvedValue({
      data: { clan_id: "clan-1", admin_password: "ABCD123456", player_password: "WXYZ987654" },
      error: null,
    });
    const rpc = vi.fn(() => ({ single }));
    const fakeSupabase = { rpc };

    const clan = await createClan(fakeSupabase, { displayName: "Iron Foundry", prefix: "IF" });

    expect(rpc).toHaveBeenCalledWith("create_clan", {
      p_display_name: "Iron Foundry",
      p_prefix: "IF",
    });
    expect(clan).toEqual({
      clanId: "clan-1",
      adminPassword: "ABCD123456",
      playerPassword: "WXYZ987654",
    });
  });
});

describe("assignClanToEvent", () => {
  it("calls assign_clan_to_event with the given clan and event ids", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const fakeSupabase = { rpc };

    await assignClanToEvent(fakeSupabase, "clan-1", "event-1");

    expect(rpc).toHaveBeenCalledWith("assign_clan_to_event", { p_clan_id: "clan-1", p_event_id: "event-1" });
  });

  it("passes null as event_id to unassign a clan", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const fakeSupabase = { rpc };

    await assignClanToEvent(fakeSupabase, "clan-1", null);

    expect(rpc).toHaveBeenCalledWith("assign_clan_to_event", { p_clan_id: "clan-1", p_event_id: null });
  });
});

describe("listClans", () => {
  it("calls list_dev_clans and returns every clan regardless of event assignment", async () => {
    const clans = [
      { clan_id: "clan-1", display_name: "Iron Foundry", prefix: "IF", event_id: "event-1" },
      { clan_id: "clan-2", display_name: "Rune Reapers", prefix: "RR", event_id: null },
    ];
    const rpc = vi.fn().mockResolvedValue({ data: clans, error: null });
    const fakeSupabase = { rpc };

    const result = await listClans(fakeSupabase);

    expect(rpc).toHaveBeenCalledWith("list_dev_clans");
    expect(result).toEqual([
      { clanId: "clan-1", displayName: "Iron Foundry", prefix: "IF", eventId: "event-1" },
      { clanId: "clan-2", displayName: "Rune Reapers", prefix: "RR", eventId: null },
    ]);
  });
});

describe("deleteEvent", () => {
  it("deletes the event by id", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const del = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: del }));
    const fakeSupabase = { from };

    await deleteEvent(fakeSupabase, "event-1");

    expect(from).toHaveBeenCalledWith("events");
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", "event-1");
  });
});

describe("setEventStatus", () => {
  it("updates the event's status", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const fakeSupabase = { from };

    await setEventStatus(fakeSupabase, "event-1", "published");

    expect(from).toHaveBeenCalledWith("events");
    expect(update).toHaveBeenCalledWith({ status: "published" });
    expect(eq).toHaveBeenCalledWith("id", "event-1");
  });
});

describe("updateEventEndTime", () => {
  it("updates the event's end_time_utc", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const fakeSupabase = { from };

    await updateEventEndTime(fakeSupabase, "event-1", "2026-09-01T00:00:00Z");

    expect(from).toHaveBeenCalledWith("events");
    expect(update).toHaveBeenCalledWith({ end_time_utc: "2026-09-01T00:00:00Z" });
    expect(eq).toHaveBeenCalledWith("id", "event-1");
  });
});

describe("updateEventStartTime", () => {
  it("updates the event's start_time_utc", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const fakeSupabase = { from };

    await updateEventStartTime(fakeSupabase, "event-1", "2026-08-01T00:00:00Z");

    expect(from).toHaveBeenCalledWith("events");
    expect(update).toHaveBeenCalledWith({ start_time_utc: "2026-08-01T00:00:00Z" });
    expect(eq).toHaveBeenCalledWith("id", "event-1");
  });
});

describe("getClanLeaderboard", () => {
  it("calls clan_totals and returns clans ranked by points descending, camelCased", async () => {
    const rows = [
      { clan_id: "clan-1", display_name: "Iron Foundry", total_points: 40 },
      { clan_id: "clan-2", display_name: "Gold Rush", total_points: 65 },
    ];
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    const fakeSupabase = { rpc };

    const result = await getClanLeaderboard(fakeSupabase, "event-1");

    expect(rpc).toHaveBeenCalledWith("clan_totals", { p_event_id: "event-1" });
    expect(result).toEqual([
      { clanId: "clan-2", displayName: "Gold Rush", totalPoints: 65 },
      { clanId: "clan-1", displayName: "Iron Foundry", totalPoints: 40 },
    ]);
  });
});

describe("deleteClan", () => {
  it("calls delete_clan with the clan id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const fakeSupabase = { rpc };

    await deleteClan(fakeSupabase, "clan-1");

    expect(rpc).toHaveBeenCalledWith("delete_clan", { p_clan_id: "clan-1" });
  });
});

describe("updateClan", () => {
  it("calls update_clan with the new display name and prefix", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const fakeSupabase = { rpc };

    await updateClan(fakeSupabase, "clan-1", { displayName: "Rune Reapers", prefix: "RR" });

    expect(rpc).toHaveBeenCalledWith("update_clan", {
      p_clan_id: "clan-1",
      p_display_name: "Rune Reapers",
      p_prefix: "RR",
    });
  });
});

describe("regenerateClanPassword", () => {
  it("calls regenerate_clan_password and returns the new plaintext password", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "NEWPASS1234", error: null });
    const fakeSupabase = { rpc };

    const password = await regenerateClanPassword(fakeSupabase, "clan-1", "admin");

    expect(rpc).toHaveBeenCalledWith("regenerate_clan_password", { p_clan_id: "clan-1", p_role: "admin" });
    expect(password).toBe("NEWPASS1234");
  });
});

describe("createBracket", () => {
  it("inserts a point bracket on the given event and returns it", async () => {
    const insertedRow = { id: "bracket-1", event_id: "event-1", label: "Hard", points: 20 };
    const single = vi.fn().mockResolvedValue({ data: insertedRow, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    const fakeSupabase = { from };

    const bracket = await createBracket(fakeSupabase, "event-1", { label: "Hard", points: 20 });

    expect(from).toHaveBeenCalledWith("point_brackets");
    expect(insert).toHaveBeenCalledWith({ event_id: "event-1", label: "Hard", points: 20 });
    expect(bracket).toEqual(insertedRow);
  });
});

describe("listBrackets", () => {
  it("selects all point brackets for the given event", async () => {
    const brackets = [{ id: "bracket-1", event_id: "event-1", label: "Hard", points: 20 }];
    const eq = vi.fn().mockResolvedValue({ data: brackets, error: null });
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const fakeSupabase = { from };

    const result = await listBrackets(fakeSupabase, "event-1");

    expect(from).toHaveBeenCalledWith("point_brackets");
    expect(eq).toHaveBeenCalledWith("event_id", "event-1");
    expect(result).toEqual(brackets);
  });
});

describe("updateBracket", () => {
  it("updates the bracket's label and points", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const fakeSupabase = { from };

    await updateBracket(fakeSupabase, "bracket-1", { label: "Very Hard", points: 30 });

    expect(from).toHaveBeenCalledWith("point_brackets");
    expect(update).toHaveBeenCalledWith({ label: "Very Hard", points: 30 });
    expect(eq).toHaveBeenCalledWith("id", "bracket-1");
  });
});

describe("deleteBracket", () => {
  it("deletes the bracket by id", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const del = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: del }));
    const fakeSupabase = { from };

    await deleteBracket(fakeSupabase, "bracket-1");

    expect(from).toHaveBeenCalledWith("point_brackets");
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", "bracket-1");
  });
});

describe("createTile", () => {
  it("inserts a tile on the given event and bracket, and returns it", async () => {
    const insertedRow = {
      id: "tile-1",
      event_id: "event-1",
      name: "Kill 5 Zulrahs",
      bracket_id: "bracket-1",
      tile_type: "complete_x_times",
      config: { target: 5 },
    };

    const single = vi.fn().mockResolvedValue({ data: insertedRow, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    const fakeSupabase = { from };

    const tile = await createTile(fakeSupabase, "event-1", {
      name: "Kill 5 Zulrahs",
      bracketId: "bracket-1",
      tileType: "complete_x_times",
      config: { target: 5 },
    });

    expect(from).toHaveBeenCalledWith("tiles");
    expect(insert).toHaveBeenCalledWith({
      event_id: "event-1",
      name: "Kill 5 Zulrahs",
      bracket_id: "bracket-1",
      tile_type: "complete_x_times",
      config: { target: 5 },
    });
    expect(tile).toEqual(insertedRow);
  });
});

describe("listTiles", () => {
  it("selects all tiles for the given event, with each tile's bracket embedded", async () => {
    const tiles = [
      {
        id: "tile-1",
        event_id: "event-1",
        name: "Kill 5 Zulrahs",
        bracket_id: "bracket-1",
        tile_type: "complete_x_times",
        config: { target: 5 },
        point_brackets: { id: "bracket-1", label: "Hard", points: 20 },
      },
    ];
    const eq = vi.fn().mockResolvedValue({ data: tiles, error: null });
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const fakeSupabase = { from };

    const result = await listTiles(fakeSupabase, "event-1");

    expect(from).toHaveBeenCalledWith("tiles");
    expect(select).toHaveBeenCalledWith("*, point_brackets(*)");
    expect(eq).toHaveBeenCalledWith("event_id", "event-1");
    expect(result).toEqual(tiles);
  });
});

describe("updateTile", () => {
  it("updates the tile's name, bracket, type, and config", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const fakeSupabase = { from };

    await updateTile(fakeSupabase, "tile-1", {
      name: "Kill 10 Zulrahs",
      bracketId: "bracket-2",
      tileType: "complete_x_times",
      config: { target: 10 },
    });

    expect(from).toHaveBeenCalledWith("tiles");
    expect(update).toHaveBeenCalledWith({
      name: "Kill 10 Zulrahs",
      bracket_id: "bracket-2",
      tile_type: "complete_x_times",
      config: { target: 10 },
    });
    expect(eq).toHaveBeenCalledWith("id", "tile-1");
  });
});

describe("deleteTile", () => {
  it("deletes the tile by id", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const del = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: del }));
    const fakeSupabase = { from };

    await deleteTile(fakeSupabase, "tile-1");

    expect(from).toHaveBeenCalledWith("tiles");
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", "tile-1");
  });
});

describe("createItem", () => {
  it("inserts an item and returns it", async () => {
    const insertedRow = { id: "item-1", name: "Zulrah's scales", photo_url: "https://example.com/scales.png" };
    const single = vi.fn().mockResolvedValue({ data: insertedRow, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    const fakeSupabase = { from };

    const item = await createItem(fakeSupabase, { name: "Zulrah's scales", photoUrl: "https://example.com/scales.png" });

    expect(from).toHaveBeenCalledWith("items");
    expect(insert).toHaveBeenCalledWith({ name: "Zulrah's scales", photo_url: "https://example.com/scales.png" });
    expect(item).toEqual(insertedRow);
  });
});

describe("listItems", () => {
  it("selects all items", async () => {
    const items = [{ id: "item-1", name: "Zulrah's scales", photo_url: null }];
    const select = vi.fn().mockResolvedValue({ data: items, error: null });
    const from = vi.fn(() => ({ select }));
    const fakeSupabase = { from };

    const result = await listItems(fakeSupabase);

    expect(from).toHaveBeenCalledWith("items");
    expect(result).toEqual(items);
  });
});

describe("deleteItem", () => {
  it("deletes the item by id", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const del = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: del }));
    const fakeSupabase = { from };

    await deleteItem(fakeSupabase, "item-1");

    expect(from).toHaveBeenCalledWith("items");
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", "item-1");
  });
});

describe("updateItem", () => {
  it("updates the item's name and photo url", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const fakeSupabase = { from };

    await updateItem(fakeSupabase, "item-1", { name: "Zulrah's scales (x1000)", photoUrl: "https://example.com/scales2.png" });

    expect(from).toHaveBeenCalledWith("items");
    expect(update).toHaveBeenCalledWith({ name: "Zulrah's scales (x1000)", photo_url: "https://example.com/scales2.png" });
    expect(eq).toHaveBeenCalledWith("id", "item-1");
  });
});

describe("createItemSet", () => {
  it("inserts an item set and returns it", async () => {
    const insertedRow = { id: "set-1", name: "Barrows sets" };
    const single = vi.fn().mockResolvedValue({ data: insertedRow, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    const fakeSupabase = { from };

    const itemSet = await createItemSet(fakeSupabase, { name: "Barrows sets" });

    expect(from).toHaveBeenCalledWith("item_sets");
    expect(insert).toHaveBeenCalledWith({ name: "Barrows sets" });
    expect(itemSet).toEqual(insertedRow);
  });
});

describe("listItemSets", () => {
  it("selects all item sets", async () => {
    const itemSets = [{ id: "set-1", name: "Barrows sets" }];
    const select = vi.fn().mockResolvedValue({ data: itemSets, error: null });
    const from = vi.fn(() => ({ select }));
    const fakeSupabase = { from };

    const result = await listItemSets(fakeSupabase);

    expect(from).toHaveBeenCalledWith("item_sets");
    expect(result).toEqual(itemSets);
  });
});

describe("updateItemSet", () => {
  it("updates the item set's name", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const fakeSupabase = { from };

    await updateItemSet(fakeSupabase, "set-1", { name: "Barrows sets (updated)" });

    expect(from).toHaveBeenCalledWith("item_sets");
    expect(update).toHaveBeenCalledWith({ name: "Barrows sets (updated)" });
    expect(eq).toHaveBeenCalledWith("id", "set-1");
  });
});

describe("deleteItemSet", () => {
  it("deletes the item set by id", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const del = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: del }));
    const fakeSupabase = { from };

    await deleteItemSet(fakeSupabase, "set-1");

    expect(from).toHaveBeenCalledWith("item_sets");
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", "set-1");
  });
});

describe("addItemToSet", () => {
  it("inserts a row linking the item to the set", async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn(() => ({ insert }));
    const fakeSupabase = { from };

    await addItemToSet(fakeSupabase, "set-1", "item-1");

    expect(from).toHaveBeenCalledWith("item_set_members");
    expect(insert).toHaveBeenCalledWith({ item_set_id: "set-1", item_id: "item-1" });
  });
});

describe("removeItemFromSet", () => {
  it("deletes the row linking the item to the set", async () => {
    const eq2 = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const del = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ delete: del }));
    const fakeSupabase = { from };

    await removeItemFromSet(fakeSupabase, "set-1", "item-1");

    expect(from).toHaveBeenCalledWith("item_set_members");
    expect(del).toHaveBeenCalled();
    expect(eq1).toHaveBeenCalledWith("item_set_id", "set-1");
    expect(eq2).toHaveBeenCalledWith("item_id", "item-1");
  });
});

describe("listItemsInSet", () => {
  it("selects the items belonging to the given set, unwrapping the join", async () => {
    const rows = [
      { items: { id: "item-1", name: "Zulrah's scales", photo_url: null } },
      { items: { id: "item-2", name: "Tanzanite fang", photo_url: null } },
    ];
    const eq = vi.fn().mockResolvedValue({ data: rows, error: null });
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const fakeSupabase = { from };

    const result = await listItemsInSet(fakeSupabase, "set-1");

    expect(from).toHaveBeenCalledWith("item_set_members");
    expect(select).toHaveBeenCalledWith("items(*)");
    expect(eq).toHaveBeenCalledWith("item_set_id", "set-1");
    expect(result).toEqual([
      { id: "item-1", name: "Zulrah's scales", photo_url: null },
      { id: "item-2", name: "Tanzanite fang", photo_url: null },
    ]);
  });
});

describe("listItemsByIds", () => {
  it("selects items whose id is in the given list", async () => {
    const items = [
      { id: "item-1", name: "Zulrah's scales", photo_url: null },
      { id: "item-2", name: "Tanzanite fang", photo_url: null },
    ];
    const inFn = vi.fn().mockResolvedValue({ data: items, error: null });
    const select = vi.fn(() => ({ in: inFn }));
    const from = vi.fn(() => ({ select }));
    const fakeSupabase = { from };

    const result = await listItemsByIds(fakeSupabase, ["item-1", "item-2"]);

    expect(from).toHaveBeenCalledWith("items");
    expect(inFn).toHaveBeenCalledWith("id", ["item-1", "item-2"]);
    expect(result).toEqual(items);
  });

  it("short-circuits to an empty array without querying when itemIds is empty", async () => {
    const from = vi.fn();
    const fakeSupabase = { from };

    const result = await listItemsByIds(fakeSupabase, []);

    expect(from).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});

describe("searchLocalItems", () => {
  it("selects items whose name matches the query, case-insensitively", async () => {
    const items = [{ id: "item-1", name: "Zulrah's scales", photo_url: null }];
    const limit = vi.fn().mockResolvedValue({ data: items, error: null });
    const ilike = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ ilike }));
    const from = vi.fn(() => ({ select }));
    const fakeSupabase = { from };

    const result = await searchLocalItems(fakeSupabase, "zulrah");

    expect(from).toHaveBeenCalledWith("items");
    expect(ilike).toHaveBeenCalledWith("name", "%zulrah%");
    expect(limit).toHaveBeenCalledWith(20);
    expect(result).toEqual(items);
  });
});

describe("getOrCreateItemFromWiki", () => {
  const wikiItem = { name: "Twisted bow", photoUrl: "https://x/tbow.png", equipmentSlot: "2h", wikiPageName: "Twisted bow" };

  it("returns the existing row when one already has this wiki_page_name", async () => {
    const existingRow = { id: "item-1", name: "Twisted bow", photo_url: "https://x/tbow.png" };
    const maybeSingle = vi.fn().mockResolvedValue({ data: existingRow, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const fakeSupabase = { from };

    const result = await getOrCreateItemFromWiki(fakeSupabase, wikiItem);

    expect(from).toHaveBeenCalledWith("items");
    expect(eq).toHaveBeenCalledWith("wiki_page_name", "Twisted bow");
    expect(result).toEqual(existingRow);
  });

  it("inserts a new row when none exists yet", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const selectEq = vi.fn(() => ({ maybeSingle }));
    const selectForFind = vi.fn(() => ({ eq: selectEq }));

    const insertedRow = { id: "item-2", name: "Twisted bow", photo_url: "https://x/tbow.png" };
    const single = vi.fn().mockResolvedValue({ data: insertedRow, error: null });
    const selectForInsert = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select: selectForInsert }));

    let selectCallCount = 0;
    const select = vi.fn(() => {
      selectCallCount += 1;
      return selectCallCount === 1 ? { eq: selectEq } : selectForInsert();
    });
    const from = vi.fn(() => ({ select, insert }));
    const fakeSupabase = { from };

    const result = await getOrCreateItemFromWiki(fakeSupabase, wikiItem);

    expect(insert).toHaveBeenCalledWith({
      name: "Twisted bow",
      photo_url: "https://x/tbow.png",
      equipment_slot: "2h",
      wiki_page_name: "Twisted bow",
    });
    expect(result).toEqual(insertedRow);
  });

  it("re-selects and returns the winner when a concurrent insert already won (unique_violation)", async () => {
    const findMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const findEq = vi.fn(() => ({ maybeSingle: findMaybeSingle }));

    const insertSingle = vi.fn().mockResolvedValue({ data: null, error: { code: "23505" } });
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));

    const winnerRow = { id: "item-3", name: "Twisted bow", photo_url: "https://x/tbow.png" };
    const raceMaybeSingle = vi.fn().mockResolvedValue({ data: winnerRow, error: null });
    const raceEq = vi.fn(() => ({ maybeSingle: raceMaybeSingle }));

    let selectCallCount = 0;
    const select = vi.fn(() => {
      selectCallCount += 1;
      return { eq: selectCallCount === 1 ? findEq : raceEq };
    });
    const from = vi.fn(() => ({ select, insert }));
    const fakeSupabase = { from };

    const result = await getOrCreateItemFromWiki(fakeSupabase, wikiItem);

    expect(select).toHaveBeenCalledTimes(2);
    expect(result).toEqual(winnerRow);
  });
});

describe("elevateToDev", () => {
  it("calls the dev-elevate function and refreshes the session on success", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { is_dev: true }, error: null });
    const refreshSession = vi.fn().mockResolvedValue({ data: {}, error: null });
    const fakeSupabase = { functions: { invoke }, auth: { refreshSession } };

    await elevateToDev(fakeSupabase, "master-password-123");

    expect(invoke).toHaveBeenCalledWith("dev-elevate", { body: { password: "master-password-123" } });
    expect(refreshSession).toHaveBeenCalled();
  });

  it("throws and does not refresh the session when the password is wrong", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { message: "invalid password" } });
    const refreshSession = vi.fn();
    const fakeSupabase = { functions: { invoke }, auth: { refreshSession } };

    await expect(elevateToDev(fakeSupabase, "wrong-password")).rejects.toThrow();
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

describe("actAsClan", () => {
  it("calls act-as-clan with the dev token as a header, refreshes the session, and returns the clan name", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { clanDisplayName: "Test1" }, error: null });
    const refreshSession = vi.fn().mockResolvedValue({ data: {}, error: null });
    const fakeSupabase = { functions: { invoke }, auth: { refreshSession } };

    const result = await actAsClan(fakeSupabase, {
      clanId: "clan-1",
      eventId: "event-1",
      devAccessToken: "dev-token-abc",
    });

    expect(invoke).toHaveBeenCalledWith("act-as-clan", {
      body: { clanId: "clan-1", eventId: "event-1" },
      headers: { "X-Dev-Authorization": "Bearer dev-token-abc" },
    });
    expect(refreshSession).toHaveBeenCalled();
    expect(result).toEqual({ clanDisplayName: "Test1" });
  });

  it("throws and does not refresh the session when the caller isn't a valid dev", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { message: "dev session required" } });
    const refreshSession = vi.fn();
    const fakeSupabase = { functions: { invoke }, auth: { refreshSession } };

    await expect(
      actAsClan(fakeSupabase, { clanId: "clan-1", eventId: "event-1", devAccessToken: "not-a-dev" })
    ).rejects.toThrow();
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

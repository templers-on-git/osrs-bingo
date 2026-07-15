import { describe, it, expect, vi } from "vitest";
import {
  createEvent,
  listEvents,
  deleteEvent,
  setEventStatus,
  updateEventEndTime,
  createClan,
  assignClanToEvent,
  listClans,
  deleteClan,
  updateClan,
  regenerateClanPassword,
  elevateToDev,
  createTile,
  listTiles,
  updateTile,
  deleteTile,
  createItem,
  listItems,
  deleteItem,
  createItemSet,
  listItemSets,
  deleteItemSet,
  addItemToSet,
  removeItemFromSet,
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

describe("createTile", () => {
  it("inserts a tile on the given event and returns it", async () => {
    const insertedRow = {
      id: "tile-1",
      event_id: "event-1",
      name: "Kill 5 Zulrahs",
      points: 10,
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
      points: 10,
      tileType: "complete_x_times",
      config: { target: 5 },
    });

    expect(from).toHaveBeenCalledWith("tiles");
    expect(insert).toHaveBeenCalledWith({
      event_id: "event-1",
      name: "Kill 5 Zulrahs",
      points: 10,
      tile_type: "complete_x_times",
      config: { target: 5 },
    });
    expect(tile).toEqual(insertedRow);
  });
});

describe("listTiles", () => {
  it("selects all tiles for the given event", async () => {
    const tiles = [
      { id: "tile-1", event_id: "event-1", name: "Kill 5 Zulrahs", points: 10, tile_type: "complete_x_times", config: { target: 5 } },
    ];
    const eq = vi.fn().mockResolvedValue({ data: tiles, error: null });
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const fakeSupabase = { from };

    const result = await listTiles(fakeSupabase, "event-1");

    expect(from).toHaveBeenCalledWith("tiles");
    expect(eq).toHaveBeenCalledWith("event_id", "event-1");
    expect(result).toEqual(tiles);
  });
});

describe("updateTile", () => {
  it("updates the tile's name, points, type, and config", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const fakeSupabase = { from };

    await updateTile(fakeSupabase, "tile-1", {
      name: "Kill 10 Zulrahs",
      points: 15,
      tileType: "complete_x_times",
      config: { target: 10 },
    });

    expect(from).toHaveBeenCalledWith("tiles");
    expect(update).toHaveBeenCalledWith({
      name: "Kill 10 Zulrahs",
      points: 15,
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

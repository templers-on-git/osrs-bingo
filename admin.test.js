import { describe, it, expect, vi } from "vitest";
import {
  createEvent,
  listEvents,
  deleteEvent,
  setEventStatus,
  createClan,
  assignClanToEvent,
  listClans,
  deleteClan,
  regenerateClanPassword,
  elevateToDev,
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

describe("deleteClan", () => {
  it("calls delete_clan with the clan id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const fakeSupabase = { rpc };

    await deleteClan(fakeSupabase, "clan-1");

    expect(rpc).toHaveBeenCalledWith("delete_clan", { p_clan_id: "clan-1" });
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

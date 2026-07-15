import { describe, it, expect, vi } from "vitest";
import { createEvent, addClanToEvent, elevateToDev } from "./admin.js";

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

describe("addClanToEvent", () => {
  it("calls create_clan and returns the new clan's id and passwords", async () => {
    // create_clan is a Postgres function (an "RPC"), not a table insert, so the
    // fake client shape is .rpc(name, args).single() instead of .from().insert()...
    const single = vi.fn().mockResolvedValue({
      data: { clan_id: "clan-1", admin_password: "ABCD123456", player_password: "WXYZ987654" },
      error: null,
    });
    const rpc = vi.fn(() => ({ single }));
    const fakeSupabase = { rpc };

    const clan = await addClanToEvent(fakeSupabase, "event-1", "Iron Foundry");

    expect(rpc).toHaveBeenCalledWith("create_clan", {
      p_event_id: "event-1",
      p_display_name: "Iron Foundry",
    });
    expect(clan).toEqual({
      clanId: "clan-1",
      adminPassword: "ABCD123456",
      playerPassword: "WXYZ987654",
    });
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

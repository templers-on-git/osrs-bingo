import { describe, it, expect, vi } from "vitest";
import { signUpForTile, dropTileSignUp, listClanTileSignups } from "./tileSignups.js";

describe("signUpForTile", () => {
  it("upserts a sign-up row for this tile/clan/ign", async () => {
    const row = { tile_id: "tile-1", clan_id: "clan-1", ign: "Zezima", signed_up_at: "2026-07-16T12:00:00.000Z" };
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const select = vi.fn(() => ({ single }));
    const upsert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ upsert }));
    const fakeSupabase = { from };

    const signup = await signUpForTile(fakeSupabase, "tile-1", "clan-1", "Zezima");

    expect(from).toHaveBeenCalledWith("tile_signups");
    expect(upsert).toHaveBeenCalledWith(
      { tile_id: "tile-1", clan_id: "clan-1", ign: "Zezima" },
      { onConflict: "tile_id,clan_id,ign" },
    );
    expect(signup).toEqual({
      tileId: "tile-1",
      clanId: "clan-1",
      ign: "Zezima",
      signedUpAt: "2026-07-16T12:00:00.000Z",
    });
  });
});

describe("dropTileSignUp", () => {
  it("deletes the sign-up row for this tile/clan/ign", async () => {
    const eq3 = vi.fn().mockResolvedValue({ error: null });
    const eq2 = vi.fn(() => ({ eq: eq3 }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const deleteFn = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ delete: deleteFn }));
    const fakeSupabase = { from };

    await dropTileSignUp(fakeSupabase, "tile-1", "clan-1", "Zezima");

    expect(from).toHaveBeenCalledWith("tile_signups");
    expect(eq1).toHaveBeenCalledWith("tile_id", "tile-1");
    expect(eq2).toHaveBeenCalledWith("clan_id", "clan-1");
    expect(eq3).toHaveBeenCalledWith("ign", "Zezima");
  });
});

describe("listClanTileSignups", () => {
  it("selects every sign-up row for the given clan, camelCased", async () => {
    const rows = [
      { tile_id: "tile-1", clan_id: "clan-1", ign: "Zezima", signed_up_at: "2026-07-16T12:00:00.000Z" },
      { tile_id: "tile-2", clan_id: "clan-1", ign: "Woox", signed_up_at: "2026-07-16T13:00:00.000Z" },
    ];
    const eq = vi.fn().mockResolvedValue({ data: rows, error: null });
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const fakeSupabase = { from };

    const result = await listClanTileSignups(fakeSupabase, "clan-1");

    expect(from).toHaveBeenCalledWith("tile_signups");
    expect(eq).toHaveBeenCalledWith("clan_id", "clan-1");
    expect(result).toEqual([
      { tileId: "tile-1", clanId: "clan-1", ign: "Zezima", signedUpAt: "2026-07-16T12:00:00.000Z" },
      { tileId: "tile-2", clanId: "clan-1", ign: "Woox", signedUpAt: "2026-07-16T13:00:00.000Z" },
    ]);
  });
});

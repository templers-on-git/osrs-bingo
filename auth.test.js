import { describe, it, expect, vi } from "vitest";
import { login } from "./auth.js";

describe("login", () => {
  it("calls the login function and refreshes the session on success", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { clan_role: "admin" }, error: null });
    const refreshSession = vi.fn().mockResolvedValue({ data: {}, error: null });
    const fakeSupabase = { functions: { invoke }, auth: { refreshSession } };

    const result = await login(fakeSupabase, { ign: "ZezimaAlt", password: "clan-password-123" });

    expect(invoke).toHaveBeenCalledWith("login", { body: { ign: "ZezimaAlt", password: "clan-password-123" } });
    expect(refreshSession).toHaveBeenCalled();
    expect(result).toEqual({ clan_role: "admin" });
  });

  it("throws and does not refresh the session on invalid credentials", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { message: "invalid password" } });
    const refreshSession = vi.fn();
    const fakeSupabase = { functions: { invoke }, auth: { refreshSession } };

    await expect(login(fakeSupabase, { ign: "ZezimaAlt", password: "wrong" })).rejects.toThrow();
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

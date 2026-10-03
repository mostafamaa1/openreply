// Value: protects=Settings password route: first set needs no current pw, change needs the right one, length rule, 401 signed out; fails_when=an open session can replace a password without the old one; why_new=route untested; seam=none
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, auth } = vi.hoisted(() => ({
  mockPrisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
  auth: { getCurrentUserId: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/login-throttle", () => ({
  reserveAttempt: vi.fn().mockResolvedValue(true),
  clearAttempts: vi.fn().mockResolvedValue(undefined),
  WINDOW_SECONDS: 900,
}));

import { GET, POST } from "@/app/api/account/password/route";
import { clearAttempts, reserveAttempt } from "@/lib/login-throttle";
import { hashPassword, verifyPassword } from "@/lib/password";

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/account/password", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  auth.getCurrentUserId.mockResolvedValue("u1");
});

describe("/api/account/password", () => {
  it("reports whether the user has a password", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ passwordHash: null });
    expect(await (await GET()).json()).toMatchObject({ data: { hasPassword: false } });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ passwordHash: "scrypt$x" });
    expect(await (await GET()).json()).toMatchObject({ data: { hasPassword: true } });
  });

  it("sets a first password without asking for a current one", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ passwordHash: null });
    const res = await post({ newPassword: "a brand new password" });
    expect(res.status).toBe(200);
    const stored = mockPrisma.user.update.mock.calls[0][0].data.passwordHash as string;
    expect(await verifyPassword("a brand new password", stored)).toBe(true);
  });

  it("requires the right current password to change an existing one", async () => {
    const existing = await hashPassword("the old password");
    mockPrisma.user.findUnique.mockResolvedValue({ passwordHash: existing });

    expect((await post({ newPassword: "a brand new password" })).status).toBe(400);
    expect(
      (await post({ currentPassword: "not the old one", newPassword: "a brand new password" })).status
    ).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();

    const res = await post({ currentPassword: "the old password", newPassword: "a brand new password" });
    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
  });

  it("answers 429 once the change budget is used, without checking or writing", async () => {
    vi.mocked(reserveAttempt).mockResolvedValueOnce(false);
    mockPrisma.user.findUnique.mockResolvedValue({ passwordHash: await hashPassword("the old password") });
    const res = await post({ currentPassword: "the old password", newPassword: "a brand new password" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("900");
    expect(reserveAttempt).toHaveBeenCalledWith("password-change", "u1");
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("counts change attempts only when a password exists, and clears them on success", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ passwordHash: null });
    await post({ newPassword: "a brand new password" });
    expect(reserveAttempt).not.toHaveBeenCalled();

    mockPrisma.user.findUnique.mockResolvedValueOnce({ passwordHash: await hashPassword("the old password") });
    await post({ currentPassword: "the old password", newPassword: "a brand new password" });
    expect(reserveAttempt).toHaveBeenCalledWith("password-change", "u1");
    expect(clearAttempts).toHaveBeenCalledWith("password-change", "u1");
  });

  it("rejects a too-short password and a malformed body before touching the user", async () => {
    expect((await post({ newPassword: "short" })).status).toBe(400);
    expect((await post({ nope: true })).status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses signed-out callers", async () => {
    auth.getCurrentUserId.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await post({ newPassword: "a brand new password" })).status).toBe(401);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

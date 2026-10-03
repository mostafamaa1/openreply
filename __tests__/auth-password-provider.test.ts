// Value: protects=password sign-in counts every attempt before checking it, refuses a locked or non-allowlisted email, and only a correct password signs in and clears the count; fails_when=the attempt reservation is dropped or moved after the hash check, or a wrong password returns a user; why_new=login-throttle.test.ts tests the helpers alone, not authorize(); seam=none
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, throttle, env } = vi.hoisted(() => ({
  mockPrisma: { user: { findUnique: vi.fn() } },
  throttle: { reserveAttempt: vi.fn(), clearAttempts: vi.fn() },
  env: { allowed: true },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/login-throttle", () => throttle);
vi.mock("@/lib/env", async (orig) => ({
  ...(await orig<typeof import("@/lib/env")>()),
  isEmailAllowedToSignIn: () => env.allowed,
}));

// next-auth itself does not load under Vitest; stub it at the module boundary
// so the config (and our authorize) is built for real.
vi.mock("next-auth", () => ({
  default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: (config: { id: string }) => ({ id: config.id, type: "credentials", options: config }),
}));
vi.mock("next-auth/providers/resend", () => ({ default: () => ({ id: "resend" }) }));
vi.mock("next-auth/providers/nodemailer", () => ({ default: () => ({ id: "nodemailer" }) }));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("@/lib/workspace", () => ({
  ensureWorkspaceForUser: vi.fn(),
  getPrimaryWorkspace: vi.fn(),
}));

import { authConfig } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

type Authorize = (c: Record<string, string>) => Promise<unknown>;
const provider = authConfig.providers.find(
  (p) => (p as { id?: string }).id === "password"
) as unknown as { authorize?: Authorize; options?: { authorize: Authorize } };
const authorize: Authorize = (c) =>
  (provider.options?.authorize ?? provider.authorize)!(c);

let hash: string;

beforeEach(async () => {
  vi.clearAllMocks();
  env.allowed = true;
  throttle.reserveAttempt.mockResolvedValue(true);
  hash ??= await hashPassword("right password!");
  mockPrisma.user.findUnique.mockResolvedValue({
    id: "u1",
    email: "a@b.co",
    name: null,
    passwordHash: hash,
  });
});

describe("password sign-in", () => {
  it("signs in with the right password, normalising the email, and clears the count", async () => {
    expect(await authorize({ email: " A@B.co ", password: "right password!" })).toMatchObject({ id: "u1" });
    expect(throttle.reserveAttempt).toHaveBeenCalledWith("login", "a@b.co");
    expect(throttle.clearAttempts).toHaveBeenCalledWith("login", "a@b.co");
  });

  it("refuses a wrong password and keeps the attempt counted", async () => {
    expect(await authorize({ email: "a@b.co", password: "wrong password" })).toBeNull();
    expect(throttle.reserveAttempt).toHaveBeenCalledTimes(1);
    expect(throttle.clearAttempts).not.toHaveBeenCalled();
  });

  it("refuses once the attempt budget is used, without checking the password", async () => {
    throttle.reserveAttempt.mockResolvedValue(false);
    expect(await authorize({ email: "a@b.co", password: "right password!" })).toBeNull();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("refuses an email outside the allowlist before counting or looking it up", async () => {
    env.allowed = false;
    expect(await authorize({ email: "a@b.co", password: "right password!" })).toBeNull();
    expect(throttle.reserveAttempt).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("refuses an unknown user and one with no password set", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    expect(await authorize({ email: "x@b.co", password: "right password!" })).toBeNull();
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u2", email: "y@b.co", name: null, passwordHash: null });
    expect(await authorize({ email: "y@b.co", password: "right password!" })).toBeNull();
  });
});

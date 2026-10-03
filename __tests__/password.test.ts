import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same password!"), hashPassword("same password!")]);
    expect(a).not.toBe(b);
  });

  it("rejects malformed stored values", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "bcrypt$abc")).toBe(false);
  });

  it("enforces the length rules", () => {
    expect(passwordProblem("short")).not.toBeNull();
    expect(passwordProblem("long enough pass")).toBeNull();
    expect(passwordProblem("x".repeat(201))).not.toBeNull();
  });
});

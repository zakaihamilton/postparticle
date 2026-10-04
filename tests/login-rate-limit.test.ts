import { describe, expect, it } from "vitest";
import { createLoginAttemptLimiter } from "@/lib/login-rate-limit";

describe("login attempt limiter", () => {
  it("allows ten attempts per IP and blocks the eleventh", () => {
    const allow = createLoginAttemptLimiter(10, 60_000);
    for (let attempt = 1; attempt <= 10; attempt++)
      expect(allow("192.0.2.1", 1_000)).toBe(true);
    expect(allow("192.0.2.1", 1_000)).toBe(false);
  });

  it("resets at the window boundary and isolates different IPs", () => {
    const allow = createLoginAttemptLimiter(1, 60_000);
    expect(allow("192.0.2.1", 1_000)).toBe(true);
    expect(allow("192.0.2.1", 1_001)).toBe(false);
    expect(allow("192.0.2.2", 1_001)).toBe(true);
    expect(allow("192.0.2.1", 61_000)).toBe(true);
  });
});

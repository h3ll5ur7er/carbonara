import { describe, expect, it } from "vitest";
import { closedAgo } from "./recent";

const now = Date.UTC(2026, 9, 27, 12);
const ago = (seconds: number) => closedAgo(now - seconds * 1000, now);

describe("closedAgo", () => {
  it("says how long ago, in the largest whole unit", () => {
    expect(ago(10)).toBe("just now");
    expect(ago(60)).toBe("1 minute ago");
    expect(ago(5 * 60 + 30)).toBe("5 minutes ago");
    expect(ago(2 * 3600)).toBe("2 hours ago");
    expect(ago(30 * 3600)).toBe("yesterday");
    expect(ago(15 * 24 * 3600)).toBe("2 weeks ago");
    expect(ago(400 * 24 * 3600)).toBe("last year");
  });

  it("treats a clock that went backwards as just now", () => {
    expect(ago(-100)).toBe("just now");
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_CATEGORIES,
  OTHER_CATEGORY,
  allocateIdeas,
  categoryStats,
  resolveCategories,
} from "@/lib/agents/categories";

const post = (category: string | null, views: number) => ({
  category,
  views,
  likes: 10,
  comments: 1,
  saved: 5,
  shares: 2,
});

describe("resolveCategories", () => {
  it("falls back to the defaults when nothing is stored", () => {
    expect(resolveCategories([])).toEqual([...DEFAULT_CATEGORIES]);
    expect(resolveCategories(null)).toEqual([...DEFAULT_CATEGORIES]);
  });

  it("trims and dedupes a stored list", () => {
    expect(resolveCategories([" Sales ", "Sales", "", "English"])).toEqual(["Sales", "English"]);
  });
});

describe("categoryStats", () => {
  it("uses the median, so one viral post does not define a topic", () => {
    const stats = categoryStats(
      [post("Sales", 100), post("Sales", 200), post("Sales", 1_000_000)],
      ["Sales"]
    );
    expect(stats.find((s) => s.category === "Sales")?.medianViews).toBe(200);
  });

  it("puts untagged posts under Other", () => {
    const stats = categoryStats([post(null, 50)], ["Sales"]);
    expect(stats.find((s) => s.category === OTHER_CATEGORY)?.posts).toBe(1);
  });
});

describe("allocateIdeas", () => {
  const categories = ["A", "B", "C"];

  it("hands out exactly the total, at least one per category", () => {
    const stats = categoryStats(
      [...Array(5)].flatMap(() => [post("A", 10_000), post("B", 1_000), post("C", 100)]),
      categories
    );
    const plan = allocateIdeas(stats, categories, 10);
    expect(plan.reduce((a, p) => a + p.ideas, 0)).toBe(10);
    expect(plan.every((p) => p.ideas >= 1)).toBe(true);
    // The topic that reaches the most people gets the most ideas.
    expect(plan.find((p) => p.category === "A")!.ideas).toBeGreaterThan(
      plan.find((p) => p.category === "C")!.ideas
    );
  });

  it("does not starve an untested topic", () => {
    const stats = categoryStats([...Array(5)].map(() => post("A", 5_000)), categories);
    const plan = allocateIdeas(stats, categories, 9);
    expect(plan.find((p) => p.category === "B")!.ideas).toBeGreaterThanOrEqual(1);
    expect(plan.find((p) => p.category === "B")!.reason).toMatch(/untested/);
  });
});

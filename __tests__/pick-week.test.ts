// Value: protects=week mix: lead idea of each category in allocation-size order, then the rest, max 7, no repeats; fails_when=week is the first 7 ideas of one topic or an idea repeats; why_new=pickWeek untested; seam=none
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ prisma: {} }));

import { pickWeek } from "@/lib/agents/agents";
import type { Idea } from "@/lib/agents/types";

const idea = (category: string, n: number): Idea => ({
  category,
  title: `${category}-${n}`,
  angle: "",
  why: "",
  format: "Reel",
  inspiredBy: null,
});

describe("pickWeek", () => {
  const ideas = [
    idea("A", 1), idea("A", 2), idea("A", 3), idea("A", 4), idea("A", 5),
    idea("B", 1), idea("B", 2),
    idea("C", 1),
    idea("D", 1),
  ];
  const allocation = [
    { category: "C", ideas: 1, reason: "" },
    { category: "A", ideas: 5, reason: "" },
    { category: "B", ideas: 2, reason: "" },
    { category: "D", ideas: 1, reason: "" },
    { category: "E", ideas: 0, reason: "" },
  ];

  it("leads with one idea per category, biggest allocation first, then fills to 7", () => {
    const week = pickWeek(ideas, allocation).map((i) => i.title);
    expect(week.slice(0, 4)).toEqual(["A-1", "B-1", "C-1", "D-1"]);
    expect(week).toHaveLength(7);
    expect(new Set(week).size).toBe(7);
    expect(week.slice(4)).toEqual(["A-2", "A-3", "A-4"]);
  });

  it("keeps idea order without an allocation and copes with few ideas", () => {
    expect(pickWeek(ideas).map((i) => i.title)).toEqual(ideas.slice(0, 7).map((i) => i.title));
    expect(pickWeek([idea("B", 1)], allocation)).toHaveLength(1);
  });
});

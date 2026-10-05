/**
 * Content topics: the categories the Ideator plans across and the creator's
 * posts are tagged with. Every one serves communication, public speaking and
 * self development.
 */

export const DEFAULT_CATEGORIES = [
  "Public Speaking",
  "Presentations",
  "Storytelling",
  "Confidence & Mindset",
  "Voice & Delivery",
  "Body Language & Presence",
  "English",
  "AI Tools & Websites",
  "Interview & Career",
  "Books & Reading",
  "Sales",
] as const;

/** Tag for a post that fits none of the categories. */
export const OTHER_CATEGORY = "Other";

export function resolveCategories(stored: string[] | null | undefined): string[] {
  const cleaned = (stored ?? []).map((c) => c.trim()).filter(Boolean);
  return cleaned.length > 0 ? [...new Set(cleaned)] : [...DEFAULT_CATEGORIES];
}

export interface CategoryStats {
  category: string;
  posts: number;
  medianViews: number;
  avgViews: number;
  engagementRate: number | null;
  /** Saves and shares per 1,000 views: how often people keep or pass it on. */
  savesPer1k: number | null;
  sharesPer1k: number | null;
}

/** Middle value (mean of the two middles for an even count); 0 when empty. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function categoryStats(
  posts: Array<{
    category: string | null;
    views: number | null;
    likes: number;
    comments: number;
    saved: number | null;
    shares: number | null;
  }>,
  categories: string[]
): CategoryStats[] {
  return [...categories, OTHER_CATEGORY]
    .map((category) => {
      const list = posts.filter((p) => (p.category ?? OTHER_CATEGORY) === category && p.views !== null);
      const views = list.map((p) => p.views ?? 0);
      const totalViews = views.reduce((a, b) => a + b, 0);
      const interactions = list.reduce(
        (a, p) => a + p.likes + p.comments + (p.saved ?? 0) + (p.shares ?? 0),
        0
      );
      const saves = list.reduce((a, p) => a + (p.saved ?? 0), 0);
      const shares = list.reduce((a, p) => a + (p.shares ?? 0), 0);
      return {
        category,
        posts: list.length,
        medianViews: median(views),
        avgViews: list.length ? Math.round(totalViews / list.length) : 0,
        engagementRate: totalViews ? interactions / totalViews : null,
        savesPer1k: totalViews ? (saves / totalViews) * 1000 : null,
        sharesPer1k: totalViews ? (shares / totalViews) * 1000 : null,
      };
    })
    .filter((s) => s.posts > 0 || s.category !== OTHER_CATEGORY);
}

/** Posts' worth of "average" a topic's score is blended with. */
const SHRINK_POSTS = 10;

/**
 * How many ideas each category gets: one each, then the extras go to the
 * categories whose posts typically reach the most people (median views,
 * nudged by saves+shares, which signal content worth following for).
 */
export function allocateIdeas(
  stats: CategoryStats[],
  categories: string[],
  total: number
): Array<{ category: string; ideas: number; reason: string }> {
  const raw = categories.map((category) => {
    const s = stats.find((x) => x.category === category);
    const keep = (s?.savesPer1k ?? 0) + (s?.sharesPer1k ?? 0);
    return {
      category,
      posts: s?.posts ?? 0,
      median: s?.medianViews ?? 0,
      score: s && s.posts > 0 ? s.medianViews * (1 + keep / 50) : NaN,
    };
  });
  const knownScores = raw.map((r) => r.score).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  const middle = knownScores.length ? knownScores[Math.floor(knownScores.length / 2)] : 1;
  // A topic with few posts is pulled toward the middle until it has history,
  // so three lucky posts cannot outrank eighty proven ones.
  const rows = raw.map((r) => {
    const n = Number.isNaN(r.score) ? 0 : r.posts;
    const score = Number.isNaN(r.score) ? middle : r.score;
    return { ...r, score: (score * n + middle * SHRINK_POSTS) / (n + SHRINK_POSTS) };
  });

  // Squared, so the extras go clearly to the strongest topics.
  const extra = Math.max(0, total - rows.length);
  const sum = rows.reduce((a, r) => a + r.score ** 2, 0) || 1;
  const shares = rows.map((r) => ({ ...r, raw: (r.score ** 2 / sum) * extra }));
  const result = shares.map((r) => ({ ...r, ideas: 1 + Math.floor(r.raw) }));
  // Hand out the remainder to the largest fractional parts.
  let left = total - result.reduce((a, r) => a + r.ideas, 0);
  for (const r of [...result].sort((a, b) => (b.raw % 1) - (a.raw % 1))) {
    if (left <= 0) break;
    r.ideas += 1;
    left -= 1;
  }

  return result.map((r) => ({
    category: r.category,
    ideas: r.ideas,
    reason:
      r.posts >= 3
        ? `${r.posts} past posts, median ${r.median.toLocaleString("en-US")} views`
        : r.posts > 0
          ? `only ${r.posts} past post${r.posts === 1 ? "" : "s"}; untested`
          : "no past posts; untested",
  }));
}

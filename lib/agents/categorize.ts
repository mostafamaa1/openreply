/**
 * Tags the account's posts with a content category from their captions.
 *
 * Only posts without a tag are sent to Gemini, in batches, so after the first
 * backfill a weekly run tags just the new posts. AI tags naming a topic that
 * no longer exists are redone; MANUAL tags are never touched. Captions are public text, so sending them to Gemini's free tier is
 * acceptable; nothing private goes with them.
 */

import { prisma } from "@/lib/db/client";
import { generateJson } from "@/lib/agents/gemini";
import { OTHER_CATEGORY } from "@/lib/agents/categories";

const BATCH_SIZE = 40;
// Spacing between calls keeps a 420-post backfill under free-tier rate limits.
const PAUSE_MS = 4_000;

export interface PostToTag {
  id: string;
  caption: string | null;
}

export async function tagUntaggedPosts(
  instagramAccountId: string,
  posts: PostToTag[],
  categories: string[],
  niche = ""
): Promise<{ tagged: number; skipped: number }> {
  const allowed = new Set([...categories, OTHER_CATEGORY]);
  const existing = await prisma.postCategory.findMany({
    where: { instagramAccountId, mediaId: { in: posts.map((p) => p.id) } },
    select: { mediaId: true, category: true, source: true },
  });
  // An AI tag naming a topic that no longer exists is redone; a MANUAL tag
  // always stands.
  const stale = existing.filter((e) => e.source !== "MANUAL" && !allowed.has(e.category));
  if (stale.length) {
    await prisma.postCategory.deleteMany({
      where: { instagramAccountId, mediaId: { in: stale.map((e) => e.mediaId) }, source: "AI" },
    });
  }
  const done = new Set(
    existing.filter((e) => !stale.includes(e)).map((e) => e.mediaId)
  );
  const todo = posts.filter((p) => !done.has(p.id));

  // A post with no caption has nothing to classify.
  const blank = todo.filter((p) => !p.caption?.trim());
  const withText = todo.filter((p) => p.caption?.trim());
  if (blank.length) {
    await prisma.postCategory.createMany({
      data: blank.map((p) => ({ instagramAccountId, mediaId: p.id, category: OTHER_CATEGORY })),
      skipDuplicates: true,
    });
  }

  let tagged = 0;
  for (let i = 0; i < withText.length; i += BATCH_SIZE) {
    if (i > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
    const batch = withText.slice(i, i + BATCH_SIZE);
    const prompt = `Classify each Instagram post of a creator${niche ? ` whose niche is: ${niche}` : ""} into exactly one category.

Categories: ${categories.map((c) => `"${c}"`).join(", ")}, or "${OTHER_CATEGORY}" if none fits.
Pick by the main lesson of the post, not by hashtags alone. If a post recommends tools, apps or websites and a category for those exists, use it.

Posts (id: caption):
${batch.map((p) => `${p.id}: ${p.caption!.replace(/\s+/g, " ").slice(0, 400)}`).join("\n")}`;

    const result = await generateJson<{ posts: Array<{ id: string; category: string }> }>(prompt, {
      type: "object",
      properties: {
        posts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              category: { type: "string", enum: [...categories, OTHER_CATEGORY] },
            },
            required: ["id", "category"],
          },
        },
      },
      required: ["posts"],
    });

    const ids = new Set(batch.map((p) => p.id));
    const rows = result.posts
      .filter((r) => ids.has(r.id))
      .map((r) => ({
        instagramAccountId,
        mediaId: r.id,
        category: allowed.has(r.category) ? r.category : OTHER_CATEGORY,
      }));
    if (rows.length) {
      await prisma.postCategory.createMany({ data: rows, skipDuplicates: true });
      tagged += rows.length;
    }
  }

  return { tagged: tagged + blank.length, skipped: withText.length - tagged };
}

export async function getPostCategories(
  instagramAccountId: string,
  mediaIds: string[]
): Promise<Map<string, { category: string; source: string }>> {
  const rows = await prisma.postCategory.findMany({
    where: { instagramAccountId, mediaId: { in: mediaIds } },
    select: { mediaId: true, category: true, source: true },
  });
  return new Map(rows.map((r) => [r.mediaId, { category: r.category, source: r.source }]));
}

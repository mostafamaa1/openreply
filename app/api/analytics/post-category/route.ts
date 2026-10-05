import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getCurrentWorkspaceContext, canManageWorkspace } from "@/lib/workspace-access";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { OTHER_CATEGORY, resolveCategories } from "@/lib/agents/categories";

const bodySchema = z.object({
  mediaId: z.string().regex(/^\d{5,30}$/),
  category: z.string().min(1).max(60),
  instagramAccountId: z.string().optional(),
});

/** Set a post's topic by hand. Manual tags are never overwritten by the tagger. */
export async function PUT(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can change topics" },
      { status: 403 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }
  const { mediaId, category, instagramAccountId } = parsed.data;

  const [account, profile] = await Promise.all([
    getWorkspaceInstagramAccount(context.workspaceId, instagramAccountId ?? null),
    prisma.contentProfile.findUnique({
      where: { workspaceId: context.workspaceId },
      select: { categories: true },
    }),
  ]);
  if (!account) {
    return NextResponse.json({ success: false, error: "No Instagram account" }, { status: 400 });
  }
  const allowed = [...resolveCategories(profile?.categories), OTHER_CATEGORY];
  if (!allowed.includes(category)) {
    return NextResponse.json({ success: false, error: "Unknown topic" }, { status: 400 });
  }

  await prisma.postCategory.upsert({
    where: { instagramAccountId_mediaId: { instagramAccountId: account.id, mediaId } },
    create: { instagramAccountId: account.id, mediaId, category, source: "MANUAL" },
    update: { category, source: "MANUAL" },
  });
  return NextResponse.json({ success: true, data: { mediaId, category, source: "MANUAL" } });
}

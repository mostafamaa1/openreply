import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";
import { OTHER_CATEGORY, resolveCategories } from "@/lib/agents/categories";

const profileSchema = z.object({
  niche: z.string().max(500),
  voice: z.string().max(500),
  audience: z.string().max(500),
  goals: z.string().max(500),
  categories: z
    .array(z.string().trim().min(1).max(40))
    .max(20)
    .optional(),
});

const SELECT = { niche: true, voice: true, audience: true, goals: true, categories: true } as const;

function present(profile: { niche: string; voice: string; audience: string; goals: string; categories: string[] } | null) {
  return {
    niche: profile?.niche ?? "",
    voice: profile?.voice ?? "",
    audience: profile?.audience ?? "",
    goals: profile?.goals ?? "",
    // Show the effective list, defaults included, so the form edits what runs.
    categories: resolveCategories(profile?.categories),
  };
}

export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const profile = await prisma.contentProfile.findUnique({
    where: { workspaceId: context.workspaceId },
    select: SELECT,
  });
  return NextResponse.json({ success: true, data: present(profile) });
}

export async function PUT(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can edit the content profile" },
      { status: 403 }
    );
  }

  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid profile" },
      { status: 400 }
    );
  }

  const { categories, ...text } = parsed.data;
  const data = {
    ...(Object.fromEntries(
      Object.entries(text).map(([k, v]) => [k, v.trim()])
    ) as Omit<z.infer<typeof profileSchema>, "categories">),
    ...(categories
      ? {
          // "Other" is the catch-all, never a planned topic.
          categories: [...new Set(categories)].filter((c) => c !== OTHER_CATEGORY),
        }
      : {}),
  };
  const profile = await prisma.contentProfile.upsert({
    where: { workspaceId: context.workspaceId },
    create: { workspaceId: context.workspaceId, ...data },
    update: data,
    select: SELECT,
  });
  return NextResponse.json({ success: true, data: present(profile) });
}

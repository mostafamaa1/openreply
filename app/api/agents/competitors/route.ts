import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";
import { MAX_COMPETITORS, handleSchema } from "@/lib/agents/competitors";

const bodySchema = z.object({ username: handleSchema });

async function listCompetitors(workspaceId: string) {
  const competitors = await prisma.competitor.findMany({
    where: { workspaceId },
    orderBy: { username: "asc" },
    include: { _count: { select: { posts: true } } },
  });
  return competitors.map((c) => ({
    username: c.username,
    followersCount: c.followersCount,
    lastScrapedAt: c.lastScrapedAt?.toISOString() ?? null,
    postCount: c._count.posts,
  }));
}

async function authorise() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return {
      error: NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }
  if (!canManageWorkspace(context.role)) {
    return {
      error: NextResponse.json(
        { success: false, error: "Only owners and admins can edit competitors" },
        { status: 403 }
      ),
    };
  }
  return { context };
}

export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  return NextResponse.json({
    success: true,
    data: await listCompetitors(context.workspaceId),
  });
}

export async function POST(request: NextRequest) {
  const { context, error } = await authorise();
  if (error) return error;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Not a valid Instagram handle" },
      { status: 400 }
    );
  }

  const count = await prisma.competitor.count({
    where: { workspaceId: context.workspaceId },
  });
  if (count >= MAX_COMPETITORS) {
    return NextResponse.json(
      { success: false, error: `Up to ${MAX_COMPETITORS} competitors` },
      { status: 400 }
    );
  }

  const { username } = parsed.data;
  await prisma.competitor.upsert({
    where: {
      workspaceId_username: { workspaceId: context.workspaceId, username },
    },
    create: { workspaceId: context.workspaceId, username },
    update: {},
  });
  return NextResponse.json({
    success: true,
    data: await listCompetitors(context.workspaceId),
  });
}

export async function DELETE(request: NextRequest) {
  const { context, error } = await authorise();
  if (error) return error;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Not a valid Instagram handle" },
      { status: 400 }
    );
  }

  await prisma.competitor.deleteMany({
    where: { workspaceId: context.workspaceId, username: parsed.data.username },
  });
  return NextResponse.json({
    success: true,
    data: await listCompetitors(context.workspaceId),
  });
}

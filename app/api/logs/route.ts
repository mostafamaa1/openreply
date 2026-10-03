import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { DmStatus, type Prisma } from "@/app/generated/prisma/client";
import { parseRange, resolveRange } from "@/lib/analytics/range";
import { getTimeZone } from "@/lib/agents/config";

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10))
  );
  const status = searchParams.get("status");
  const instagramAccountId = searchParams.get("instagramAccountId");
  const skip = (page - 1) * limit;
  const parsedStatus =
    status && Object.values(DmStatus).includes(status as DmStatus)
      ? (status as DmStatus)
      : null;

  const query = searchParams.get("q")?.trim().slice(0, 100) ?? "";
  // Date filter only when the page sends one; no range params means every log.
  const hasRange =
    searchParams.has("range") || (searchParams.has("from") && searchParams.has("to"));
  const range = hasRange ? resolveRange(parseRange(searchParams), new Date(), getTimeZone()) : null;

  const where: Prisma.DmLogWhereInput = {
    workspaceId,
    ...(parsedStatus ? { status: parsedStatus } : {}),
    ...(instagramAccountId && instagramAccountId !== "all"
      ? { instagramAccountId }
      : {}),
    ...(range ? { createdAt: { gte: range.from, lt: range.to } } : {}),
    ...(query
      ? {
          OR: [
            { commenterName: { contains: query, mode: "insensitive" } },
            { commentText: { contains: query, mode: "insensitive" } },
            { matchedKeyword: { contains: query, mode: "insensitive" } },
            { automation: { name: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.dmLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        automation: { select: { name: true, keywords: true } },
        instagramAccount: { select: { username: true } },
      },
    }),
    prisma.dmLog.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
}

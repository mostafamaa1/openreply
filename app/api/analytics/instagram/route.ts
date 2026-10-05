import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { getTimeZone } from "@/lib/agents/config";
import { parseRange, resolveRange } from "@/lib/analytics/range";
import { getInstagramAnalytics } from "@/lib/analytics/instagram";
import { MetaApiError, PermissionError, TokenExpiredError } from "@/lib/meta/client";
import { prisma } from "@/lib/db/client";
import { resolveCategories } from "@/lib/agents/categories";
import { getPostCategories } from "@/lib/agents/categorize";

// A cold 12-month range fetches insights for a few hundred posts.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const params = request.nextUrl.searchParams;
  const account = await getWorkspaceInstagramAccount(
    workspaceId,
    params.get("instagramAccountId")
  );
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Connect an Instagram account to see analytics." },
      { status: 400 }
    );
  }

  try {
    const [data, profile] = await Promise.all([
      getInstagramAnalytics(account, resolveRange(parseRange(params), new Date(), getTimeZone()), getTimeZone(), {
        fresh: params.get("fresh") === "1",
      }),
      prisma.contentProfile.findUnique({
        where: { workspaceId },
        select: { categories: true },
      }),
    ]);
    // Topics change by hand at any time, so they are joined after the cache.
    const tags = await getPostCategories(account.id, data.posts.map((p) => p.id));
    data.categories = resolveCategories(profile?.categories);
    data.posts = data.posts.map((p) => {
      const tag = tags.get(p.id);
      return {
        ...p,
        category: tag?.category ?? null,
        categorySource: (tag?.source as "AI" | "MANUAL" | undefined) ?? null,
      };
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const upstream =
      error instanceof MetaApiError ||
      (error instanceof TypeError && error.message === "fetch failed");
    const message =
      error instanceof TokenExpiredError
        ? "Your Instagram connection expired. Reconnect it in Settings."
        : error instanceof PermissionError
          ? "Instagram did not grant insights access. Reconnect it in Settings."
          : upstream
            ? "Instagram did not respond. Try again in a minute."
            : // Not Instagram's fault: say so, and leave the detail in the server log.
              "Analytics failed on the server. Check the server log for the error.";
    console.error("[Analytics] Instagram failed:", error instanceof Error ? error.message : error);
    const status = upstream ? 502 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

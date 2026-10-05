import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getTimeZone } from "@/lib/agents/config";
import { parseRange, resolveRange } from "@/lib/analytics/range";
import { getDmAnalytics } from "@/lib/analytics/dms";

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const params = request.nextUrl.searchParams;
  const accountId = params.get("instagramAccountId");
  const data = await getDmAnalytics(
    workspaceId,
    accountId && accountId !== "all" ? accountId : null,
    resolveRange(parseRange(params), new Date(), getTimeZone()),
    getTimeZone()
  );
  return NextResponse.json({ success: true, data });
}

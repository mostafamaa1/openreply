import { NextResponse } from "next/server";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";
import { requestContentCycle } from "@/lib/queue/content-agents";

/** Queue a content-agent cycle for this workspace; the worker runs it. */
export async function POST() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can run the agents" },
      { status: 403 }
    );
  }

  let result: Awaited<ReturnType<typeof requestContentCycle>>;
  try {
    result = await requestContentCycle(context.workspaceId);
  } catch (error) {
    console.error("[Agents] Run now failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "The job queue is not responding. Try again in a minute." },
      { status: 503 }
    );
  }
  if (!result.queued) {
    const hours = Math.ceil(result.retryAfterSeconds / 3600);
    return NextResponse.json(
      {
        success: false,
        error: `A run was started recently. The next manual run is available in about ${hours} hour${hours === 1 ? "" : "s"}.`,
      },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } }
    );
  }
  return NextResponse.json({ success: true });
}

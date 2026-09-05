import { NextRequest, NextResponse } from "next/server";
import { attachNextReel } from "@/lib/polling/next-reel-binder";

/**
 * Daily backstop for the "next reel" binder.
 *
 * The binding logic lives in lib/polling/next-reel-binder.ts because the worker
 * runs it hourly too. This cron stays on a daily schedule so vercel.json is
 * valid on the Hobby plan, which allows at most one run per cron per day.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const data = await attachNextReel();

  return NextResponse.json({ success: true, data });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getCurrentUserId } from "@/lib/auth";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { clearAttempts, reserveAttempt, WINDOW_SECONDS } from "@/lib/login-throttle";

const bodySchema = z.object({
  // Length is checked by passwordProblem, so the message names the limit;
  // this bound only stops oversized bodies.
  currentPassword: z.string().max(1000).optional(),
  newPassword: z.string().max(1000),
});

/** Whether the signed-in user has a password yet. */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  return NextResponse.json({ success: true, data: { hasPassword: Boolean(user?.passwordHash) } });
}

/** Set or change the signed-in user's password. */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  const problem = passwordProblem(newPassword);
  if (problem) {
    return NextResponse.json({ success: false, error: problem }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  // Changing an existing password needs the current one, so a session left
  // open on someone else's screen cannot take the account over.
  if (user?.passwordHash) {
    // Same budget as sign-in, so an open session cannot guess the current
    // password without limit.
    if (!(await reserveAttempt("password-change", userId))) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many tries. Wait ${WINDOW_SECONDS / 60} minutes, then try again.`,
        },
        { status: 429, headers: { "Retry-After": String(WINDOW_SECONDS) } }
      );
    }
    const ok = currentPassword ? await verifyPassword(currentPassword, user.passwordHash) : false;
    if (!ok) {
      return NextResponse.json(
        { success: false, error: "Your current password is not right." },
        { status: 400 }
      );
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  await clearAttempts("password-change", userId);
  return NextResponse.json({ success: true, data: { hasPassword: true } });
}

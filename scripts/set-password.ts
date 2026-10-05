/**
 * Set (or reset) a user's sign-in password.
 *
 *   npm run set-password -- you@example.com
 *
 * Prompts for the password without echoing it. For scripts, pass it in the
 * OPENREPLY_PASSWORD environment variable instead. Creates the user (and a
 * workspace) when the email has never signed in.
 */

import "dotenv/config";
import { prisma } from "@/lib/db/client";
import { hashPassword, passwordProblem } from "@/lib/password";
import { ensureWorkspaceForUser } from "@/lib/workspace";

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error("No terminal to prompt in; set OPENREPLY_PASSWORD instead."));
      return;
    }
    process.stdout.write(question);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (char: string) => {
      if (char === "\r" || char === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (char === "\u0003") {
        process.stdout.write("\n");
        process.exit(130);
      } else if (char === "\u007f" || char === "\b") {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Usage: npm run set-password -- you@example.com");
  }

  let password = process.env.OPENREPLY_PASSWORD ?? "";
  if (!password) {
    password = await promptHidden("New password: ");
    const again = await promptHidden("Repeat it: ");
    if (password !== again) throw new Error("The two passwords differ.");
  }
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);

  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } });
    console.log(`Password set for ${email}.`);
  } else {
    const user = await prisma.user.create({ data: { email, passwordHash } });
    await ensureWorkspaceForUser(user.id, email);
    console.log(`Created ${email} with a workspace and set the password.`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

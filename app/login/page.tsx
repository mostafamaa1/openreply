import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, EMAIL_PROVIDER_ID, PASSWORD_PROVIDER_ID, signIn } from "@/lib/auth";
import { getCampaignTemplate } from "@/lib/templates/campaign-templates";
import { DemoNotice } from "@/components/demo-notice";
import { safeCallback } from "@/lib/safe-callback";

export const metadata = {
  title: "Login - OpenReply",
  description: "Sign in to manage Instagram comment-to-DM campaigns.",
};

const inputClass =
  "w-full px-4 py-3 rounded bg-surface border border-border text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none transition-colors";


export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    checkEmail?: string;
    callbackUrl?: string;
    template?: string;
    method?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const checkEmail = params.checkEmail === "1";
  const useLink = params.method === "link";
  const selectedTemplate = getCampaignTemplate(params.template);
  const templateCallbackUrl = selectedTemplate
    ? `/campaigns/new?template=${selectedTemplate.slug}`
    : null;
  const callbackUrl = safeCallback(params.callbackUrl, templateCallbackUrl ?? "/dashboard");

  // Already signed in: go straight on. (The proxy cannot tell a stale cookie
  // from a live session, so this check lives here.)
  const session = await auth();
  if (session?.user?.id) redirect(callbackUrl);

  const query = (extra: Record<string, string>) =>
    `/login?${new URLSearchParams({
      ...(params.callbackUrl ? { callbackUrl } : {}),
      ...(params.template ? { template: params.template } : {}),
      ...extra,
    })}`;

  // Server actions may only close over plain values, not helpers.
  const errorUrl = query({ error: "credentials" });

  async function signInWithPassword(formData: FormData) {
    "use server";
    try {
      await signIn(PASSWORD_PROVIDER_ID, {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirectTo: callbackUrl,
      });
    } catch (error) {
      // A successful sign-in throws Next's redirect; only auth failures stop here.
      if (error instanceof AuthError) redirect(errorUrl);
      throw error;
    }
  }

  async function sendMagicLink(formData: FormData) {
    "use server";
    await signIn(EMAIL_PROVIDER_ID, {
      email: String(formData.get("email") ?? ""),
      redirectTo: callbackUrl,
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-foreground">OpenReply</h1>
          <p className="text-muted text-sm leading-relaxed mt-2">
            {selectedTemplate
              ? `Sign in to use the ${selectedTemplate.title} template.`
              : "Sign in, then connect your Instagram professional account."}
          </p>
        </div>

        <DemoNotice variant="panel" />

        <div className="panel rounded p-8 shadow-black/40">
          {selectedTemplate && !checkEmail && (
            <div className="mb-5 border border-accent/20 bg-accent/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                Template selected
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {selectedTemplate.title}
              </p>
            </div>
          )}

          {checkEmail ? (
            <div className="text-center py-4">
              <h2 className="text-lg font-semibold mb-2">Check your email</h2>
              <p className="text-sm text-muted">
                We sent you a secure sign-in link. Open it on this device to
                continue.
              </p>
            </div>
          ) : useLink ? (
            <form action={sendMagicLink} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-foreground">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center rounded bg-accent px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                Email me a sign-in link
              </button>
              <p className="text-center text-sm">
                <Link href={query({})} className="text-muted hover:text-foreground">
                  Sign in with a password instead
                </Link>
              </p>
            </form>
          ) : (
            <form action={signInWithPassword} className="space-y-5">
              {params.error === "credentials" && (
                <p role="alert" className="rounded border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
                  That email and password don&apos;t match. After 10 failed tries, sign-in
                  for that email pauses for 15 minutes.
                </p>
              )}
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-foreground">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-foreground">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center rounded bg-accent px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                Sign in
              </button>
              <p className="text-center text-sm">
                <Link href={query({ method: "link" })} className="text-muted hover:text-foreground">
                  No password yet? Email me a sign-in link
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

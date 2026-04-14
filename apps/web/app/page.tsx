import { redirect } from "next/navigation";
import { SignInButton } from "@/components/sign-in-button";
import { handleInstallationCallback } from "@/lib/install-callback";
import { getCurrentSession } from "@/lib/session";

const authErrorMessages: Record<string, string> = {
  OAuthSignin: "GitHub sign-in could not start. Check the GitHub OAuth client settings.",
  OAuthCallback: "GitHub returned to PR Guard, but the callback could not be completed.",
  OAuthCreateAccount: "PR Guard could not create the GitHub account link.",
  EmailCreateAccount: "PR Guard could not create the account.",
  Callback: "The sign-in callback failed.",
  OAuthAccountNotLinked: "This GitHub account is already linked to another PR Guard user.",
  SessionRequired: "Please sign in to continue.",
  Default: "Sign-in failed. Check the server logs for the exact NextAuth error."
};

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCurrentSession();
  const params = await searchParams;
  const installationIdRaw = typeof params.installation_id === "string" ? params.installation_id : null;
  const installationId = installationIdRaw ? Number.parseInt(installationIdRaw, 10) : null;
  const setupAction = typeof params.setup_action === "string" ? params.setup_action : null;
  const installResult =
    installationId && Number.isFinite(installationId)
      ? await handleInstallationCallback({
          installationId,
          setupAction,
          userId: session?.user?.id ?? null
        })
      : null;

  if (session?.user?.id) {
    redirect("/dashboard/repositories");
  }

  const errorCode = typeof params.error === "string" ? params.error : null;
  const authError = errorCode ? (authErrorMessages[errorCode] ?? authErrorMessages.Default) : null;

  return (
    <>
      <main className="hero">
        <img
          className="hero-visual"
          src="https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1800&q=80"
          alt=""
        />
        <div className="hero-inner">
          <p className="eyebrow">PR Guard</p>
          <h1>First-pass pull request review before the human review.</h1>
          <p className="lead">
            Connect a GitHub App, review JavaScript, TypeScript, and Python diffs, then publish one
            concise summary comment with deterministic checks plus AI quality, security, and
            architecture reviewers.
          </p>
          <div className="actions">
            <SignInButton />
          </div>
          {authError ? (
            <p className="auth-error">
              {authError} <span className="muted">Error code: {errorCode}</span>
            </p>
          ) : null}
          {installResult ? (
            <div className="auth-error install-status">
              <strong>GitHub App installation received.</strong>
              <br />
              {installResult.synced
                ? `Synced ${installResult.repositoryCount} repository connection(s). Sign in on this same URL to view the dashboard.`
                : `PR Guard could not sync the installation yet: ${installResult.error}`}
              <div className="actions">
                <SignInButton callbackUrl="/dashboard/repositories" />
              </div>
            </div>
          ) : null}
        </div>
      </main>
      <section id="how-it-works" className="container">
        <div className="grid">
          <div>
            <p className="eyebrow">Run locally</p>
            <h2>Postgres, Redis, web, worker, webhook.</h2>
          </div>
          <p className="lead">
            Sign in with GitHub, install the GitHub App on a repository, expose the webhook with
            ngrok, then open or update a pull request.
          </p>
        </div>
      </section>
    </>
  );
}

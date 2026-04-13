"use client";

import { signIn, signOut } from "next-auth/react";
import { useState } from "react";

export function SignInButton({ callbackUrl = "/dashboard/repositories" }: { callbackUrl?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function absoluteCallbackUrl() {
    if (callbackUrl.startsWith("http://") || callbackUrl.startsWith("https://")) {
      return callbackUrl;
    }

    if (typeof window === "undefined") {
      return callbackUrl;
    }

    return new URL(callbackUrl, window.location.origin).toString();
  }

  async function handleSignIn() {
    setPending(true);
    setError(null);

    try {
      const targetCallbackUrl = absoluteCallbackUrl();
      await signIn("github", {
        callbackUrl: targetCallbackUrl,
        redirect: true
      });
    } catch {
      setError("GitHub sign-in could not start. Check APP_URL/NEXTAUTH_URL and try again.");
      setPending(false);
    }
  }

  return (
    <span className="inline-action">
      <button disabled={pending} onClick={() => void handleSignIn()}>
        {pending ? "Redirecting..." : "Sign in with GitHub"}
      </button>
      {error ? <span className="inline-error">{error}</span> : null}
    </span>
  );
}

export function SignOutButton() {
  return (
    <button className="secondary" onClick={() => void signOut({ callbackUrl: "/" })}>
      Sign out
    </button>
  );
}

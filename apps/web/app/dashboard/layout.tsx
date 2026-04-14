import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { RealtimeBridge } from "@/components/realtime-bridge";
import { SignOutButton } from "@/components/sign-in-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/");
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/dashboard/repositories">
          <span className="brand-mark">PG</span>
          <span>PR Guard</span>
        </Link>
        <nav className="nav">
          <Link href="/dashboard/repositories">Repositories</Link>
          <Link href="/dashboard/settings">Settings</Link>
          <RealtimeBridge />
          <span>{session.user.githubLogin ?? session.user.email}</span>
          <SignOutButton />
        </nav>
      </header>
      <main className="container">{children}</main>
    </div>
  );
}

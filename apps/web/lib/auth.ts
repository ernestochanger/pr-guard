import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@pr-guard/db";
import { getAuthEnv, logger } from "@pr-guard/shared";
import type { Adapter } from "next-auth/adapters";
import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

const env = getAuthEnv();

function sanitizeForAuthLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeForAuthLog);
  }

  if (value instanceof Error) {
    const errorWithDetails = value as Error & {
      code?: unknown;
      cause?: unknown;
      stack?: string;
    };
    return {
      name: errorWithDetails.name,
      message: errorWithDetails.message,
      code: errorWithDetails.code,
      cause: sanitizeForAuthLog(errorWithDetails.cause),
      stack: errorWithDetails.stack
    };
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("secret") ||
      lower.includes("token") ||
      lower.includes("authorization") ||
      lower === "cookies" ||
      lower === "access_token" ||
      lower === "refresh_token" ||
      lower === "id_token"
    ) {
      output[key] = "[redacted]";
    } else {
      output[key] = sanitizeForAuthLog(item);
    }
  }
  return output;
}

export const authOptions: NextAuthOptions = {
  debug: process.env.NEXTAUTH_DEBUG === "true",
  adapter: PrismaAdapter(prisma) as Adapter,
  session: {
    strategy: "database",
    maxAge: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24
  },
  cookies:
    env.NODE_ENV === "production"
      ? {
          sessionToken: {
            name: "__Secure-next-auth.session-token",
            options: {
              httpOnly: true,
              sameSite: "lax",
              path: "/",
              secure: true
            }
          }
        }
      : undefined,
  providers: [
    GitHubProvider({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "read:user user:email repo read:org"
        }
      }
    })
  ],
  callbacks: {
    async signIn() {
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.githubLogin = user.githubLogin;
      }
      return session;
    }
  },
  events: {
    async signIn({ user, account, profile }) {
      const githubProfile = profile as { login?: string; id?: number } | undefined;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          githubLogin: githubProfile?.login ?? user.name ?? null,
          githubUserId: githubProfile?.id ? BigInt(githubProfile.id) : undefined
        }
      });

      if (account?.provider === "github" && account.access_token && account.providerAccountId) {
        await prisma.account.update({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId
            }
          },
          data: {
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            expires_at: account.expires_at,
            token_type: account.token_type,
            scope: account.scope,
            id_token: account.id_token
          }
        });
      }
    }
  },
  logger: {
    error(code, metadata) {
      const sanitized = sanitizeForAuthLog(metadata);
      logger.error({ code, metadata: sanitized }, "NextAuth error");
    },
    warn(code) {
      logger.warn({ code }, "NextAuth warning");
    },
    debug(code, metadata) {
      const sanitized = sanitizeForAuthLog(metadata);
      logger.debug({ code, metadata: sanitized }, "NextAuth debug");
    }
  },
  pages: {
    signIn: "/"
  }
};

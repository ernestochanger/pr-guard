import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { getRuntimeEnv } from "@pr-guard/shared";

export function normalizeGitHubPrivateKey(privateKey: string): string {
  const trimmed = privateKey.trim().replace(/^['"]|['"]$/g, "");
  const withNewlines = trimmed.replace(/\\n/g, "\n");

  if (withNewlines.includes("-----BEGIN") && withNewlines.includes("PRIVATE KEY-----")) {
    return withNewlines;
  }

  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8").trim();
    if (decoded.includes("-----BEGIN") && decoded.includes("PRIVATE KEY-----")) {
      return decoded;
    }
  } catch {
    // Fall through to the actionable configuration error below.
  }

  throw new Error(
    "Invalid GITHUB_PRIVATE_KEY. Use the GitHub App private key PEM, preserving line breaks as \\n, or provide the base64-encoded PEM."
  );
}

export function createAppOctokit(): Octokit {
  const env = getRuntimeEnv();
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: env.GITHUB_APP_ID,
      privateKey: normalizeGitHubPrivateKey(env.GITHUB_PRIVATE_KEY)
    }
  });
}

export async function createInstallationOctokit(installationId: number | bigint): Promise<Octokit> {
  const env = getRuntimeEnv();
  const auth = createAppAuth({
    appId: env.GITHUB_APP_ID,
    privateKey: normalizeGitHubPrivateKey(env.GITHUB_PRIVATE_KEY),
    installationId: Number(installationId)
  });
  const installationAuth = await auth({ type: "installation" });

  return new Octokit({
    auth: installationAuth.token
  });
}

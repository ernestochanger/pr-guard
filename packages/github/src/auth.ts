import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { getRuntimeEnv } from "@pr-guard/shared";

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

export function createAppOctokit(): Octokit {
  const env = getRuntimeEnv();
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: env.GITHUB_APP_ID,
      privateKey: normalizePrivateKey(env.GITHUB_PRIVATE_KEY)
    }
  });
}

export async function createInstallationOctokit(installationId: number | bigint): Promise<Octokit> {
  const env = getRuntimeEnv();
  const auth = createAppAuth({
    appId: env.GITHUB_APP_ID,
    privateKey: normalizePrivateKey(env.GITHUB_PRIVATE_KEY),
    installationId: Number(installationId)
  });
  const installationAuth = await auth({ type: "installation" });

  return new Octokit({
    auth: installationAuth.token
  });
}

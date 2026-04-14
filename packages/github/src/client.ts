import type { Octokit } from "@octokit/rest";
import { managedCommentMarker } from "@pr-guard/shared";
import type {
  GitHubChangedFile,
  GitHubPullRequestRef,
  GitHubRepositoryRef,
  PublishedManagedComment,
  PublishedPullRequestComment
} from "./types";

export function splitRepositoryFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository full name: ${fullName}`);
  }
  return { owner, repo };
}

function toRepositoryRef(repo: {
  id: number;
  owner?: { login?: string | null } | null;
  name: string;
  full_name?: string | null;
  html_url?: string | null;
  default_branch?: string | null;
  private?: boolean | null;
}): GitHubRepositoryRef {
  const fullName = repo.full_name ?? `${repo.owner?.login}/${repo.name}`;
  const { owner } = splitRepositoryFullName(fullName);
  return {
    id: BigInt(repo.id),
    owner,
    name: repo.name,
    fullName,
    htmlUrl: repo.html_url ?? `https://github.com/${fullName}`,
    defaultBranch: repo.default_branch ?? null,
    isPrivate: Boolean(repo.private)
  };
}

export async function listInstallationRepositories(octokit: Octokit): Promise<GitHubRepositoryRef[]> {
  const repos = await octokit.paginate(octokit.apps.listReposAccessibleToInstallation, {
    per_page: 100
  });
  return repos.map(toRepositoryRef);
}

export async function listUserRepositoriesWithPermissions(
  oauthToken: string
): Promise<Array<GitHubRepositoryRef & { canAdmin: boolean; role: string }>> {
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: oauthToken });
  const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
    affiliation: "owner,collaborator,organization_member",
    per_page: 100,
    sort: "updated"
  });

  return repos.map((repo) => ({
    ...toRepositoryRef(repo),
    canAdmin: Boolean(repo.permissions?.admin),
    role: repo.permissions?.admin ? "admin" : repo.permissions?.push ? "write" : "read"
  }));
}

export async function getRepository(octokit: Octokit, fullName: string): Promise<GitHubRepositoryRef> {
  const { owner, repo } = splitRepositoryFullName(fullName);
  const response = await octokit.repos.get({ owner, repo });
  return toRepositoryRef(response.data);
}

export async function getPullRequest(
  octokit: Octokit,
  fullName: string,
  pullNumber: number
): Promise<GitHubPullRequestRef> {
  const { owner, repo } = splitRepositoryFullName(fullName);
  const response = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pullNumber
  });
  const pr = response.data;

  return {
    id: pr.id ? BigInt(pr.id) : null,
    number: pr.number,
    title: pr.title,
    authorLogin: pr.user?.login ?? null,
    headSha: pr.head.sha,
    baseSha: pr.base.sha ?? null,
    headRef: pr.head.ref ?? null,
    baseRef: pr.base.ref ?? null,
    state: pr.state,
    htmlUrl: pr.html_url
  };
}

export async function listPullRequestFiles(
  octokit: Octokit,
  fullName: string,
  pullNumber: number
): Promise<GitHubChangedFile[]> {
  const { owner, repo } = splitRepositoryFullName(fullName);
  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100
  });

  return files.map((file) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch: file.patch ?? null,
    rawUrl: file.raw_url ?? null,
    blobUrl: file.blob_url ?? null
  }));
}

export async function publishOrUpdateManagedComment(input: {
  octokit: Octokit;
  fullName: string;
  pullNumber: number;
  body: string;
  previousCommentId?: bigint | null;
}): Promise<PublishedManagedComment> {
  const { owner, repo } = splitRepositoryFullName(input.fullName);
  const body = `${managedCommentMarker}\n${input.body}`;

  if (input.previousCommentId) {
    try {
      const updated = await input.octokit.issues.updateComment({
        owner,
        repo,
        comment_id: Number(input.previousCommentId),
        body
      });
      return {
        commentId: BigInt(updated.data.id),
        status: "UPDATED",
        htmlUrl: updated.data.html_url
      };
    } catch {
      // Fall back to discovery below. The comment may have been deleted or moved.
    }
  }

  const comments = await input.octokit.paginate(input.octokit.issues.listComments, {
    owner,
    repo,
    issue_number: input.pullNumber,
    per_page: 100
  });

  const existing = comments.find((comment) => comment.body?.includes(managedCommentMarker));
  if (existing) {
    const updated = await input.octokit.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body
    });
    return {
      commentId: BigInt(updated.data.id),
      status: "UPDATED",
      htmlUrl: updated.data.html_url
    };
  }

  const created = await input.octokit.issues.createComment({
    owner,
    repo,
    issue_number: input.pullNumber,
    body
  });
  return {
    commentId: BigInt(created.data.id),
    status: "PUBLISHED",
    htmlUrl: created.data.html_url
  };
}

export async function createPullRequestComment(input: {
  octokit: Octokit;
  fullName: string;
  pullNumber: number;
  body: string;
}): Promise<PublishedPullRequestComment> {
  const { owner, repo } = splitRepositoryFullName(input.fullName);
  const created = await input.octokit.issues.createComment({
    owner,
    repo,
    issue_number: input.pullNumber,
    body: input.body
  });

  return {
    commentId: BigInt(created.data.id),
    htmlUrl: created.data.html_url
  };
}

export type GitHubRepositoryRef = {
  id: bigint;
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string | null;
  isPrivate: boolean;
};

export type GitHubPullRequestRef = {
  id: bigint | null;
  number: number;
  title: string;
  authorLogin: string | null;
  headSha: string;
  baseSha: string | null;
  headRef: string | null;
  baseRef: string | null;
  state: string;
  htmlUrl: string;
};

export type GitHubChangedFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
  rawUrl: string | null;
  blobUrl: string | null;
};

export type PublishedManagedComment = {
  commentId: bigint;
  status: "PUBLISHED" | "UPDATED";
  htmlUrl: string;
};

export type PublishedPullRequestComment = {
  commentId: bigint;
  htmlUrl: string;
};

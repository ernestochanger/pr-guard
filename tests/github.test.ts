import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createPullRequestComment,
  normalizeGitHubPrivateKey,
  publishOrUpdateManagedComment,
  verifyWebhookSignature
} from "@pr-guard/github";

describe("GitHub webhook signature validation", () => {
  it("validates sha256 signatures with timing-safe comparison", () => {
    const secret = "webhook-secret";
    const payload = JSON.stringify({ ok: true });
    const signature = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;

    expect(verifyWebhookSignature({ secret, payload, signatureHeader: signature })).toBe(true);
    expect(verifyWebhookSignature({ secret, payload, signatureHeader: "sha256=bad" })).toBe(false);
  });
});

describe("GitHub App private key normalization", () => {
  const pem = [
    "-----BEGIN RSA PRIVATE KEY-----",
    "abc123",
    "-----END RSA PRIVATE KEY-----"
  ].join("\n");

  it("accepts escaped newline PEM values from .env files", () => {
    expect(normalizeGitHubPrivateKey(pem.replace(/\n/g, "\\n"))).toBe(pem);
  });

  it("accepts base64 encoded PEM values", () => {
    expect(normalizeGitHubPrivateKey(Buffer.from(pem, "utf8").toString("base64"))).toBe(pem);
  });

  it("throws an actionable error for malformed values", () => {
    expect(() => normalizeGitHubPrivateKey("not-a-private-key")).toThrow(/GITHUB_PRIVATE_KEY/);
  });
});

describe("managed PR comment publishing", () => {
  it("updates an existing managed comment when discovered", async () => {
    const octokit = {
      paginate: vi.fn(async () => [
        {
          id: 123,
          body: "<!-- pr-guard:managed-comment -->\nold",
          html_url: "https://github.test/comment/123"
        }
      ]),
      issues: {
        listComments: vi.fn(),
        updateComment: vi.fn(async () => ({
          data: { id: 123, html_url: "https://github.test/comment/123" }
        })),
        createComment: vi.fn()
      }
    };

    const result = await publishOrUpdateManagedComment({
      octokit: octokit as never,
      fullName: "owner/repo",
      pullNumber: 5,
      body: "new"
    });

    expect(result.status).toBe("UPDATED");
    expect(octokit.issues.createComment).not.toHaveBeenCalled();
    expect(octokit.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 123 })
    );
  });

  it("creates a managed comment when none exists", async () => {
    const octokit = {
      paginate: vi.fn(async () => []),
      issues: {
        listComments: vi.fn(),
        updateComment: vi.fn(),
        createComment: vi.fn(async () => ({
          data: { id: 456, html_url: "https://github.test/comment/456" }
        }))
      }
    };

    const result = await publishOrUpdateManagedComment({
      octokit: octokit as never,
      fullName: "owner/repo",
      pullNumber: 5,
      body: "new"
    });

    expect(result.status).toBe("PUBLISHED");
    expect(octokit.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 5 })
    );
  });
});

describe("manual PR comment publishing", () => {
  it("creates a new pull request comment with the exact body", async () => {
    const octokit = {
      issues: {
        createComment: vi.fn(async () => ({
          data: { id: 789, html_url: "https://github.test/comment/789" }
        }))
      }
    };

    const result = await createPullRequestComment({
      octokit: octokit as never,
      fullName: "owner/repo",
      pullNumber: 5,
      body: "Manual note\n\nPlease take a look."
    });

    expect(result).toEqual({
      commentId: 789n,
      htmlUrl: "https://github.test/comment/789"
    });
    expect(octokit.issues.createComment).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      issue_number: 5,
      body: "Manual note\n\nPlease take a look."
    });
  });
});

import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { publishOrUpdateManagedComment, verifyWebhookSignature } from "@pr-guard/github";

describe("GitHub webhook signature validation", () => {
  it("validates sha256 signatures with timing-safe comparison", () => {
    const secret = "webhook-secret";
    const payload = JSON.stringify({ ok: true });
    const signature = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;

    expect(verifyWebhookSignature({ secret, payload, signatureHeader: signature })).toBe(true);
    expect(verifyWebhookSignature({ secret, payload, signatureHeader: "sha256=bad" })).toBe(false);
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

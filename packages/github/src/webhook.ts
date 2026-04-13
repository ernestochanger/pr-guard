import { z } from "zod";

export const githubPullRequestWebhookSchema = z.object({
  action: z.enum(["opened", "reopened", "synchronize"]),
  installation: z.object({
    id: z.number().int().positive()
  }),
  repository: z.object({
    id: z.number().int().positive(),
    full_name: z.string(),
    name: z.string(),
    html_url: z.string().url(),
    default_branch: z.string().nullable().optional(),
    private: z.boolean(),
    owner: z.object({
      login: z.string()
    })
  }),
  pull_request: z.object({
    id: z.number().int().positive(),
    number: z.number().int().positive(),
    title: z.string(),
    html_url: z.string().url(),
    state: z.string(),
    user: z.object({ login: z.string() }).nullable(),
    head: z.object({
      sha: z.string(),
      ref: z.string().nullable().optional()
    }),
    base: z.object({
      sha: z.string().nullable().optional(),
      ref: z.string().nullable().optional()
    })
  })
});

export const githubInstallationWebhookSchema = z.object({
  action: z.enum(["created", "deleted", "suspend", "unsuspend"]),
  installation: z.object({
    id: z.number().int().positive(),
    account: z.object({
      login: z.string(),
      type: z.string().optional()
    }),
    target_type: z.string().optional(),
    permissions: z.record(z.string(), z.string()).optional()
  }),
  repositories: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string(),
        full_name: z.string(),
        private: z.boolean().optional()
      })
    )
    .optional()
});

export const githubInstallationRepositoriesWebhookSchema = z.object({
  action: z.enum(["added", "removed"]),
  installation: z.object({
    id: z.number().int().positive()
  }),
  repositories_added: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string(),
        full_name: z.string(),
        private: z.boolean().optional()
      })
    )
    .optional(),
  repositories_removed: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string(),
        full_name: z.string(),
        private: z.boolean().optional()
      })
    )
    .optional()
});

export function mapPullRequestAction(action: string): "OPENED" | "REOPENED" | "SYNCHRONIZE" {
  if (action === "opened") {
    return "OPENED";
  }
  if (action === "reopened") {
    return "REOPENED";
  }
  return "SYNCHRONIZE";
}

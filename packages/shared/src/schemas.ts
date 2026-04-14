import { z } from "zod";
import {
  aiProviders,
  analysisStatuses,
  findingCategories,
  pullRequestEventTypes,
  realtimeEventTypes,
  reviewerTypes,
  severities
} from "./enums";

export const severitySchema = z.enum(severities);
export const findingCategorySchema = z.enum(findingCategories);
export const reviewerTypeSchema = z.enum(reviewerTypes);
export const aiProviderSchema = z.enum(aiProviders);
export const analysisStatusSchema = z.enum(analysisStatuses);
export const pullRequestEventTypeSchema = z.enum(pullRequestEventTypes);
export const realtimeEventTypeSchema = z.enum(realtimeEventTypes);

export const repositorySettingsSchema = z
  .object({
    qualityEnabled: z.boolean(),
    securityEnabled: z.boolean(),
    architectureEnabled: z.boolean(),
    minimumSeverity: severitySchema
  })
  .strict()
  .refine(
    (value) => value.qualityEnabled || value.securityEnabled || value.architectureEnabled,
    "At least one AI reviewer must remain enabled."
  );

export const appSettingsSchema = z.object({
  defaultAiProvider: aiProviderSchema
});

export const aiReviewerFindingSchema = z.object({
  title: z.string().trim().min(1).max(180),
  category: z.enum(["QUALITY", "SECURITY", "ARCHITECTURE"]),
  severity: severitySchema,
  explanation: z.string().trim().min(1).max(2000),
  filePath: z.string().trim().min(1).max(500).nullable(),
  lineStart: z.number().int().positive().nullable(),
  lineEnd: z.number().int().positive().nullable(),
  confidence: z.number().min(0).max(1)
});

export const aiReviewerOutputSchema = z.object({
  summary: z.string().trim().max(4000).default(""),
  findings: z.array(aiReviewerFindingSchema).max(30).default([])
});

export const normalizedFindingSchema = z.object({
  id: z.string(),
  reviewerType: reviewerTypeSchema,
  category: findingCategorySchema,
  severity: severitySchema,
  title: z.string().trim().min(1).max(180),
  explanation: z.string().trim().min(1).max(3000),
  filePath: z.string().trim().min(1).max(500).nullable(),
  lineStart: z.number().int().positive().nullable(),
  lineEnd: z.number().int().positive().nullable(),
  confidence: z.number().min(0).max(1),
  fingerprint: z.string().min(12).max(128),
  source: z.string().optional()
});

export const analysisListFiltersSchema = z.object({
  severity: severitySchema.optional(),
  category: findingCategorySchema.optional(),
  status: analysisStatusSchema.optional(),
  reviewerType: reviewerTypeSchema.optional()
});

export const pullRequestAnalysisJobSchema = z.object({
  analysisId: z.string().cuid(),
  attemptId: z.string().cuid(),
  repositoryId: z.string().cuid(),
  pullRequestId: z.string().cuid(),
  reason: pullRequestEventTypeSchema
});

export const commentPublishJobSchema = z.object({
  analysisId: z.string().cuid(),
  attemptId: z.string().cuid()
});

export const manualPullRequestCommentSchema = z
  .object({
    body: z.string().trim().min(1, "Comment body is required.").max(65_000)
  })
  .strict();

export const installationSyncJobSchema = z.object({
  installationId: z.string().cuid().optional(),
  githubInstallationId: z.number().int().positive(),
  action: z.enum(["created", "deleted", "suspend", "unsuspend", "added", "removed", "sync"])
});

export const realtimeEventPayloadSchema = z.object({
  type: realtimeEventTypeSchema,
  repositoryId: z.string().cuid().nullable().optional(),
  analysisId: z.string().cuid().nullable().optional(),
  message: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional()
});

export type RepositorySettingsInput = z.infer<typeof repositorySettingsSchema>;
export type AppSettingsInput = z.infer<typeof appSettingsSchema>;
export type AIReviewerOutput = z.infer<typeof aiReviewerOutputSchema>;
export type AIReviewerFinding = z.infer<typeof aiReviewerFindingSchema>;
export type NormalizedFinding = z.infer<typeof normalizedFindingSchema>;
export type AnalysisListFilters = z.infer<typeof analysisListFiltersSchema>;
export type PullRequestAnalysisJob = z.infer<typeof pullRequestAnalysisJobSchema>;
export type CommentPublishJob = z.infer<typeof commentPublishJobSchema>;
export type ManualPullRequestCommentInput = z.infer<typeof manualPullRequestCommentSchema>;
export type InstallationSyncJob = z.infer<typeof installationSyncJobSchema>;
export type RealtimeEventPayload = z.infer<typeof realtimeEventPayloadSchema>;

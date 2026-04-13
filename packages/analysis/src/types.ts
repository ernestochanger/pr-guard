import type { FindingCategory, NormalizedFinding, ReviewerType, Severity } from "@pr-guard/shared";

export type ChangedFileInput = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
};

export type SupportedLanguage = "javascript" | "typescript" | "python";

export type DiffLine = {
  type: "add" | "remove" | "context";
  content: string;
  oldLine: number | null;
  newLine: number | null;
};

export type DiffFileContext = {
  filePath: string;
  language: SupportedLanguage;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string;
  lines: DiffLine[];
  truncated: boolean;
};

export type DiffContext = {
  files: DiffFileContext[];
  ignoredFiles: number;
  supportedFiles: number;
  truncated: boolean;
  totalPatchChars: number;
};

export type FindingDraft = {
  reviewerType: ReviewerType;
  category: FindingCategory;
  severity: Severity;
  title: string;
  explanation: string;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  confidence: number;
  source?: string;
};

export type ConsolidationResult = {
  allFindings: NormalizedFinding[];
  surfacedFindings: NormalizedFinding[];
  overallSeverity: Severity | null;
};

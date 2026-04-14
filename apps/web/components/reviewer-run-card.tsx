"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/badges";

type ReviewerRunCardProps = {
  reviewerType: string;
  status: string;
  summary: string | null;
  error: string | null;
};

const RAW_ERROR_LINE_LIMIT = 3;
const RAW_ERROR_CHARACTER_LIMIT = 320;

function friendlyErrorSummary(error: string) {
  const normalized = error.toLowerCase();

  if (
    normalized.includes("rate limit") ||
    normalized.includes("resource_exhausted") ||
    normalized.includes("429")
  ) {
    return "Rate limit exceeded for AI provider.";
  }

  if (normalized.includes("quota") || normalized.includes("free tier")) {
    return "Reviewer failed due to provider quota limit.";
  }

  if (
    normalized.includes("fetch") ||
    normalized.includes("network") ||
    normalized.includes("timeout") ||
    normalized.includes("econn")
  ) {
    return "Unable to fetch reviewer response.";
  }

  return "Reviewer failed before a response was available.";
}

function previewRawError(error: string) {
  const lines = error.split(/\r?\n/);
  const linePreview = lines.slice(0, RAW_ERROR_LINE_LIMIT).join("\n");

  if (linePreview.length <= RAW_ERROR_CHARACTER_LIMIT) {
    return linePreview;
  }

  return `${linePreview.slice(0, RAW_ERROR_CHARACTER_LIMIT).trimEnd()}...`;
}

export function ReviewerRunCard({ reviewerType, status, summary, error }: ReviewerRunCardProps) {
  const [showFullError, setShowFullError] = useState(false);
  const rawErrorPreview = useMemo(() => (error ? previewRawError(error) : null), [error]);
  const hasLongError = Boolean(error && rawErrorPreview && rawErrorPreview.length < error.length);
  const note = error ? friendlyErrorSummary(error) : (summary ?? "No reviewer note.");
  const rawErrorText = showFullError && error ? error : rawErrorPreview;

  return (
    <div className="card compact reviewer-run-card">
      <div className="row reviewer-run-heading">
        <strong>{reviewerType}</strong>
        <Badge value={status} />
      </div>

      <div className="reviewer-run-content">
        <p className="muted reviewer-run-note">{note}</p>
        {rawErrorText ? (
          <div className="reviewer-error-details" aria-label={`${reviewerType} raw error details`}>
            <span className="reviewer-error-label">Raw error</span>
            <pre>{rawErrorText}</pre>
          </div>
        ) : null}
      </div>

      {hasLongError ? (
        <button
          className="reviewer-error-toggle"
          type="button"
          aria-expanded={showFullError}
          onClick={() => setShowFullError((current) => !current)}
        >
          {showFullError ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

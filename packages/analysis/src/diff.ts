import type { ChangedFileInput, DiffContext, DiffFileContext, DiffLine, SupportedLanguage } from "./types";

const languageByExtension: Array<[RegExp, SupportedLanguage]> = [
  [/\.[cm]?jsx?$/i, "javascript"],
  [/\.[cm]?tsx?$/i, "typescript"],
  [/\.py$/i, "python"]
];

export function detectSupportedLanguage(filePath: string): SupportedLanguage | null {
  for (const [pattern, language] of languageByExtension) {
    if (pattern.test(filePath)) {
      return language;
    }
  }
  return null;
}

export function isSupportedFile(filePath: string): boolean {
  return detectSupportedLanguage(filePath) !== null;
}

export function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const rawLine of patch.split("\n")) {
    const headerMatch = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(rawLine);
    if (headerMatch) {
      oldLine = Number.parseInt(headerMatch[1] ?? "0", 10);
      newLine = Number.parseInt(headerMatch[2] ?? "0", 10);
      continue;
    }

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      lines.push({
        type: "add",
        content: rawLine.slice(1),
        oldLine: null,
        newLine
      });
      newLine += 1;
      continue;
    }

    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      lines.push({
        type: "remove",
        content: rawLine.slice(1),
        oldLine,
        newLine: null
      });
      oldLine += 1;
      continue;
    }

    lines.push({
      type: "context",
      content: rawLine.startsWith(" ") ? rawLine.slice(1) : rawLine,
      oldLine,
      newLine
    });
    oldLine += 1;
    newLine += 1;
  }

  return lines;
}

export function normalizeDiffContext(
  files: ChangedFileInput[],
  options: { maxFiles: number; maxPatchChars: number }
): DiffContext {
  const supported = files
    .map((file) => ({ file, language: detectSupportedLanguage(file.filename) }))
    .filter((entry): entry is { file: ChangedFileInput; language: SupportedLanguage } => Boolean(entry.language))
    .filter((entry) => Boolean(entry.file.patch));

  const selected: DiffFileContext[] = [];
  let totalPatchChars = 0;
  let truncated = false;

  for (const { file, language } of supported) {
    if (selected.length >= options.maxFiles) {
      truncated = true;
      break;
    }

    const remainingChars = options.maxPatchChars - totalPatchChars;
    if (remainingChars <= 0) {
      truncated = true;
      break;
    }

    const fullPatch = file.patch ?? "";
    const filePatch = fullPatch.length > remainingChars ? fullPatch.slice(0, remainingChars) : fullPatch;
    const fileTruncated = filePatch.length < fullPatch.length;
    selected.push({
      filePath: file.filename,
      language,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: filePatch,
      lines: parsePatch(filePatch),
      truncated: fileTruncated
    });
    totalPatchChars += filePatch.length;
    truncated = truncated || fileTruncated;
  }

  return {
    files: selected,
    ignoredFiles: files.length - selected.length,
    supportedFiles: selected.length,
    truncated,
    totalPatchChars
  };
}

export function formatDiffContextForPrompt(context: DiffContext): string {
  if (context.files.length === 0) {
    return "No supported JavaScript, TypeScript, or Python patch content was available for this PR.";
  }

  return context.files
    .map((file) => {
      const header = [
        `FILE: ${file.filePath}`,
        `LANGUAGE: ${file.language}`,
        `STATUS: ${file.status}`,
        `ADDITIONS: ${file.additions}`,
        `DELETIONS: ${file.deletions}`,
        file.truncated ? "TRUNCATED: true" : "TRUNCATED: false"
      ].join("\n");
      return `${header}\nPATCH:\n${file.patch}`;
    })
    .join("\n\n---\n\n");
}

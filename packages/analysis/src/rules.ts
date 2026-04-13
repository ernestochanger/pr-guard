import type { DiffContext, DiffFileContext, DiffLine, FindingDraft } from "./types";

type Rule = {
  id: string;
  run(file: DiffFileContext): FindingDraft[];
};

function addedLines(file: DiffFileContext): DiffLine[] {
  return file.lines.filter((line) => line.type === "add");
}

function finding(input: {
  source: string;
  severity: FindingDraft["severity"];
  category: FindingDraft["category"];
  title: string;
  explanation: string;
  file: DiffFileContext;
  line: DiffLine | null;
  confidence: number;
}): FindingDraft {
  return {
    reviewerType: "DETERMINISTIC",
    category: input.category,
    severity: input.severity,
    title: input.title,
    explanation: input.explanation,
    filePath: input.file.filePath,
    lineStart: input.line?.newLine ?? null,
    lineEnd: input.line?.newLine ?? null,
    confidence: input.confidence,
    source: input.source
  };
}

const rules: Rule[] = [
  {
    id: "hardcoded-secret",
    run(file) {
      const secretPattern =
        /(api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]\s*["'][A-Za-z0-9_\-./+=]{16,}["']/i;
      return addedLines(file)
        .filter((line) => secretPattern.test(line.content))
        .map((line) =>
          finding({
            source: "hardcoded-secret",
            severity: "HIGH",
            category: "SECURITY",
            title: "Potential hardcoded secret",
            explanation:
              "A newly added line looks like it may embed a credential or token directly in source code. Move secrets into a managed secret store or environment variable before review.",
            file,
            line,
            confidence: 0.86
          })
        );
    }
  },
  {
    id: "debug-leftover",
    run(file) {
      if (file.language === "python") {
        return [];
      }
      return addedLines(file)
        .filter((line) => /\bconsole\.(log|debug|trace)\s*\(/.test(line.content))
        .map((line) =>
          finding({
            source: "debug-leftover",
            severity: "LOW",
            category: "QUALITY",
            title: "Debug logging added",
            explanation:
              "A console debug statement was added. Keep production logs intentional and use the application logger when this information is needed.",
            file,
            line,
            confidence: 0.78
          })
        );
    }
  },
  {
    id: "disabled-auth",
    run(file) {
      const disabledAuthPattern =
        /(skipAuth|disableAuth|auth\s*[:=]\s*false|requireAuth\s*[:=]\s*false|isAdmin\s*=\s*true|permitAll)/i;
      return addedLines(file)
        .filter((line) => disabledAuthPattern.test(line.content))
        .map((line) =>
          finding({
            source: "disabled-auth",
            severity: "HIGH",
            category: "SECURITY",
            title: "Possible auth or permission bypass",
            explanation:
              "The change appears to weaken an authentication or authorization check. Confirm this cannot bypass access control in production paths.",
            file,
            line,
            confidence: 0.72
          })
        );
    }
  },
  {
    id: "dangerous-eval-exec",
    run(file) {
      const pattern =
        file.language === "python"
          ? /\b(eval|exec)\s*\(|subprocess\.[A-Za-z_]+\([^)]*shell\s*=\s*True/
          : /\beval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*["'`]/
      return addedLines(file)
        .filter((line) => pattern.test(line.content))
        .map((line) =>
          finding({
            source: "dangerous-eval-exec",
            severity: "HIGH",
            category: "SECURITY",
            title: "Dangerous dynamic execution",
            explanation:
              "The change introduces dynamic code or shell execution. This should be avoided or tightly constrained because user-controlled input can become code execution.",
            file,
            line,
            confidence: 0.84
          })
        );
    }
  },
  {
    id: "todo-fixme",
    run(file) {
      const criticalPath = /(auth|payment|billing|security|permission|admin|api|database|db)/i.test(
        file.filePath
      );
      return addedLines(file)
        .filter((line) => /\b(TODO|FIXME)\b/i.test(line.content))
        .map((line) =>
          finding({
            source: "todo-fixme",
            severity: criticalPath ? "MEDIUM" : "LOW",
            category: "MAINTAINABILITY",
            title: criticalPath ? "TODO/FIXME in critical path" : "TODO/FIXME added",
            explanation:
              "A TODO or FIXME was added in changed code. Make the follow-up explicit before merging, especially when the path handles security, data, or API behavior.",
            file,
            line,
            confidence: criticalPath ? 0.74 : 0.6
          })
        );
    }
  },
  {
    id: "broad-exception-swallowing",
    run(file) {
      const pattern =
        file.language === "python"
          ? /^\s*except\s*(Exception)?\s*:\s*(pass)?\s*$/
          : /^\s*catch\s*\([^)]*\)\s*\{\s*\}?/;
      return addedLines(file)
        .filter((line) => pattern.test(line.content))
        .map((line) =>
          finding({
            source: "broad-exception-swallowing",
            severity: "MEDIUM",
            category: "RELIABILITY",
            title: "Broad exception swallowing",
            explanation:
              "The change appears to catch or suppress errors without handling them. Preserve useful failure information and avoid hiding production defects.",
            file,
            line,
            confidence: 0.69
          })
        );
    }
  },
  {
    id: "sql-interpolation",
    run(file) {
      const pattern =
        file.language === "python"
          ? /(f["'`].*\b(SELECT|INSERT|UPDATE|DELETE)\b|\.format\([^)]*\).*\b(SELECT|INSERT|UPDATE|DELETE)\b)/i
          : /`[^`]*\b(SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{/i;
      return addedLines(file)
        .filter((line) => pattern.test(line.content))
        .map((line) =>
          finding({
            source: "sql-interpolation",
            severity: "HIGH",
            category: "SECURITY",
            title: "Possible SQL string interpolation",
            explanation:
              "A SQL statement appears to interpolate values directly. Use parameterized queries or ORM bindings to avoid injection risk.",
            file,
            line,
            confidence: 0.8
          })
        );
    }
  },
  {
    id: "insecure-http",
    run(file) {
      return addedLines(file)
        .filter((line) => /http:\/\/(?!localhost|127\.0\.0\.1)/i.test(line.content))
        .map((line) =>
          finding({
            source: "insecure-http",
            severity: "MEDIUM",
            category: "SECURITY",
            title: "Insecure HTTP URL added",
            explanation:
              "The change adds a plain HTTP URL. Prefer HTTPS unless this is an intentional local-only or private network endpoint.",
            file,
            line,
            confidence: 0.76
          })
        );
    }
  },
  {
    id: "large-function-heuristic",
    run(file) {
      const adds = addedLines(file);
      const functionStart = adds.find((line) =>
        file.language === "python"
          ? /^\s*def\s+\w+\s*\(/.test(line.content)
          : /\b(function\s+\w+|\w+\s*=\s*\([^)]*\)\s*=>|\w+\s*\([^)]*\)\s*\{)/.test(
              line.content
            )
      );
      if (!functionStart || adds.length < 80) {
        return [];
      }
      return [
        finding({
          source: "large-function-heuristic",
          severity: "MEDIUM",
          category: "MAINTAINABILITY",
          title: "Large changed function",
          explanation:
            "This patch adds a large amount of logic around a function. Consider splitting validation, IO, and business logic before review so defects are easier to spot.",
          file,
          line: functionStart,
          confidence: 0.58
        })
      ];
    }
  },
  {
    id: "architecture-path-violation",
    run(file) {
      const lowerPath = file.filePath.toLowerCase();
      const importsDb = addedLines(file).find((line) => /from\s+["'].*(db|prisma)|require\(["'].*(db|prisma)/i.test(line.content));
      if (importsDb && /(components|ui|pages\/public)/i.test(lowerPath)) {
        return [
          finding({
            source: "architecture-path-violation",
            severity: "MEDIUM",
            category: "ARCHITECTURE",
            title: "UI layer imports database code",
            explanation:
              "A UI-facing file appears to import database or Prisma code. Keep database access in server-side modules to avoid leaking privileged logic into presentation layers.",
            file,
            line: importsDb,
            confidence: 0.66
          })
        ];
      }
      return [];
    }
  }
];

export function runDeterministicRules(context: DiffContext): FindingDraft[] {
  return context.files.flatMap((file) => rules.flatMap((rule) => rule.run(file)));
}

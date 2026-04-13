# PR Guard

PR Guard is a production-minded MVP for automated first-pass pull request review. It runs as a
Next.js web dashboard plus a GitHub App webhook receiver and a separate BullMQ worker. For each
supported pull request diff, it runs deterministic checks and three AI reviewers, then publishes one
managed summary comment back to the pull request.

Human reviewers remain the final decision makers. PR Guard does not block merges, auto-fix code, or
scan entire repositories.

## Architecture

- `apps/web`: Next.js App Router application, GitHub sign-in, protected dashboard, API routes,
  webhook receiver, repository settings, manual reruns, and Server-Sent Events.
- `apps/worker`: Node.js TypeScript worker with BullMQ consumers for analysis, comment publishing,
  and installation sync.
- `packages/db`: Prisma schema and DB helpers for repository settings, authorization, realtime
  events, and analysis lifecycle transitions.
- `packages/github`: GitHub App auth, webhook signature validation, repository/PR fetching, and
  managed PR comment publishing.
- `packages/ai`: OpenAI and Google AI provider adapters, reviewer prompts, timeout/retry handling,
  JSON extraction, and zod validation.
- `packages/analysis`: diff filtering/chunking, deterministic rules, finding normalization,
  dedupe, prioritization, and markdown summary generation.
- `packages/shared`: enums, zod schemas, env validation, queue names, logger, and shared errors.

Primary data flow:

1. GitHub sends a signed webhook to `POST /api/github/webhook`.
2. The web app verifies the signature, records the delivery id, ignores unconnected repositories,
   upserts PR metadata, and queues an analysis job.
3. The worker fetches current PR files, skips stale head SHAs, normalizes supported JS/TS/Python
   patches, runs deterministic rules and enabled AI reviewers, stores raw reviewer output and
   normalized findings, and queues comment publishing.
4. The comment worker creates or updates the single PR Guard managed PR comment.
5. Dashboard clients receive SSE events from `GET /api/realtime` and refresh automatically.

## Prerequisites

- Node.js `>=20.18.0`
- npm
- PostgreSQL
- Redis
- A GitHub OAuth app or GitHub App client credentials for sign-in
- A GitHub App for webhook installation and PR comments
- OpenAI API key and/or Google AI API key

This project uses Prisma 7, so the database URL is configured through
`packages/db/prisma.config.ts` instead of `datasource.url` in `schema.prisma`.

## Local Setup

Install dependencies:

```bash
npm install
```

Create local env:

```bash
cp .env.example .env
```

Fill in `.env`. The application and worker share the same env file.

Generate Prisma Client:

```bash
npm run prisma:generate
```

Run the initial migration:

```bash
npm run prisma:migrate
```

Start Redis if you do not already have it running:

```bash
docker run --rm -p 6379:6379 redis:7
```

Run the web app:

```bash
npm run dev:web
```

Run the worker in another terminal:

```bash
npm run dev:worker
```

The web app runs on `http://localhost:3000` by default.

When using ngrok, `next dev` may log browser console errors for
`/_next/webpack-hmr`. That is Next.js hot reload, not PR Guard realtime. For the cleanest ngrok
OAuth/GitHub App test, run the web app in production mode:

```bash
npm run build:web
npm run start:web
```

Keep the worker running separately with `npm run dev:worker`.

## Environment Variables

Use `.env.example` as the source of truth.

Important values:

- `APP_URL` and `NEXTAUTH_URL`: local URL, usually `http://localhost:3000`.
- `NEXTAUTH_SECRET`: at least 16 random characters; use a long random value in production.
- `DATABASE_URL`: PostgreSQL connection string.
- `REDIS_URL`: Redis connection string for BullMQ and worker queues.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: OAuth credentials used for user sign-in.
- `GITHUB_APP_ID`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_PRIVATE_KEY`, and `GITHUB_APP_NAME`: GitHub App
  integration.
- `OPENAI_API_KEY` and `GOOGLE_AI_API_KEY`: AI provider credentials.
- `DEFAULT_AI_PROVIDER`: `OPENAI` or `GOOGLE` for new repository settings.
- `ANALYSIS_MAX_FILES` and `ANALYSIS_MAX_PATCH_CHARS`: large PR guardrails.
- `AI_TIMEOUT_MS`: per-reviewer request timeout.

`GITHUB_PRIVATE_KEY` may be pasted with escaped newlines. The app converts `\n` into real newlines.

## GitHub App Setup

Create a GitHub App manually in GitHub.

Suggested permissions:

- Repository metadata: read-only
- Pull requests: read-only
- Contents: read-only
- Issues: read and write, for pull request comments

Subscribe to webhook events:

- `pull_request`
- `installation`
- `installation_repositories`

Set the webhook URL to:

```text
https://<your-public-url>/api/github/webhook
```

For local testing, expose the Next.js app:

```bash
ngrok http 3000
```

Then set the GitHub App webhook URL to the ngrok HTTPS URL plus `/api/github/webhook`.

The GitHub App installation flow is linked from the dashboard using:

```text
https://github.com/apps/<GITHUB_APP_NAME>/installations/new
```

## Repository Connection

Repositories become connected when the GitHub App installation sync records them in the database.
Users see only connected repositories that are also visible through their signed-in GitHub OAuth
account. The dashboard syncs user repository memberships on the repositories page.

Duplicate active repository connections are prevented by the unique GitHub repository id in the
database. If an installation is removed or suspended, repository status moves to
`INSTALLATION_REVOKED` or `SUSPENDED`, and future PR webhooks are ignored.

Repository settings are per repo:

- Quality reviewer enabled or disabled
- Security reviewer enabled or disabled
- Architecture reviewer enabled or disabled
- Minimum surfaced severity: `LOW`, `MEDIUM`, or `HIGH`
- AI provider: `OPENAI` or `GOOGLE`

At least one reviewer must remain enabled. Settings affect future analyses only.

## PR Summary Comment Lifecycle

PR Guard publishes one managed comment per analysis using a hidden marker:

```text
<!-- pr-guard:managed-comment -->
```

On re-analysis, the worker first tries the stored GitHub comment id. If that fails, it searches PR
comments for the marker and updates the existing managed comment. If no managed comment exists, it
creates one.

The comment includes:

- Analysis status
- AI provider
- Supported and ignored file counts
- Severity summary
- Recommendation text
- Top surfaced findings
- Partial-result notes when a reviewer fails

Full normalized findings and raw reviewer outputs are stored in the dashboard for audit/debugging.

## Realtime Updates

The web app exposes `GET /api/realtime` as an authenticated Server-Sent Events stream. The worker and
webhook receiver write `RealtimeEvent` rows when repositories change, webhooks arrive, analyses
start or finish, findings are stored, comments publish, and reruns progress.

The dashboard opens an EventSource connection and calls `router.refresh()` when relevant events
arrive. This is the primary UX path; normal server-rendered pages remain a durable fallback.

## Testing A PR Flow Locally

1. Start PostgreSQL and Redis.
2. Fill `.env`.
3. Run `npm run prisma:migrate`.
4. Run `npm run dev:web`.
5. Run `npm run dev:worker`.
6. Start `ngrok http 3000`.
7. Configure the GitHub App webhook URL.
8. Install the GitHub App on a test repository.
9. Sign in to PR Guard with GitHub.
10. Open a PR changing `.js`, `.jsx`, `.ts`, `.tsx`, or `.py` files.
11. Watch the dashboard update and verify the managed PR comment appears.

## Tests

Run unit tests:

```bash
npm test
```

Run TypeScript:

```bash
npm run typecheck
```

The default suite covers:

- Diff filtering and patch parsing
- Deterministic rules
- Finding dedupe, severity thresholding, and summary generation
- AI JSON parsing and validation
- GitHub webhook signature validation
- Managed comment create/update behavior
- Repository settings validation

DB-backed integration tests are opt-in because they mutate a configured database:

```bash
RUN_DB_TESTS=true npm test
```

## MVP Limitations

- GitHub only
- Pull request diffs only
- JavaScript, TypeScript, and Python only
- One consolidated PR summary comment
- No inline review comments
- No auto-fix
- No auto-merge
- No merge blocking
- No full repository scans
- No GitLab, Bitbucket, Slack, Jira, or IDE extension
- No AI providers beyond OpenAI and Google AI

## Useful Commands

```bash
npm run dev:web
npm run dev:worker
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
npm run typecheck
npm test
```

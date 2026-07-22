# Codebase Improvements & Technical Roadmap

Status: Proposal
Scope: `backend/`, `frontend/`, tooling & process

---

## TL;DR

The app works, but both sides of the codebase have grown without an architecture. The backend is a single 300+ line `index.ts` that mixes HTTP, validation, business logic, DB access and Temporal orchestration — no SOLID boundaries at all. The frontend has a god-component (`LeadsList.tsx`, ~335 lines) doing everything from data fetching to inline SVGs. Types are duplicated between frontend and backend and have already drifted (the frontend calls `PUT /leads/:id`, the backend only handles `PATCH`). The proposal: Clean Architecture on the backend, feature-modular structure on the frontend (FSD is overkill at this size, but the module boundaries below map 1:1 to FSD slices if we grow into it), and a shared API contract so drift becomes impossible.

---

## 1. Backend: no layering, no SOLID → Clean Architecture

### Current state

Everything lives in `backend/src/index.ts`:

- Route handlers contain validation, business rules, Prisma queries and Temporal client calls inline. Single Responsibility is violated everywhere; there is nothing to unit-test in isolation (only `messageGenerator` has tests — not coincidentally, it's the only extracted module).
- `PrismaClient` and the Temporal `Connection` are created ad-hoc (Temporal connection is re-created inside the request handler on every `/leads/verify-emails` call). No dependency injection, so handlers can't be tested without a real DB and a running Temporal server.
- The API server and the Temporal worker run in the same process (`index.ts` calls `runTemporalWorker()`). They can't be scaled, deployed or restarted independently, and a worker crash takes the API down (`process.exit(1)`).
- Config is hardcoded: port `4000`, `localhost:7233`, task queue `'myQueue'`, CORS `*`. `.env.sample` exists but nothing reads it.

### Target structure

```
backend/src/
  domain/            # Entities, value objects, domain errors (no framework imports)
    lead.ts
  application/       # Use cases, one per file; depend on ports (interfaces)
    leads/
      import-leads.ts
      generate-messages.ts
      verify-emails.ts
    ports/
      lead-repository.ts
      workflow-client.ts
  infrastructure/    # Adapters implementing the ports
    prisma/          # PrismaLeadRepository
    temporal/        # workflows, activities, worker entrypoint, TemporalWorkflowClient
    providers/       # phone-enrichment provider adapters behind a common interface
  http/              # Express: routes, controllers, request schemas (zod), error middleware
  config/            # typed env parsing, single source of truth
  main.ts            # composition root (wires ports to adapters)
  worker.ts          # separate worker entrypoint
```

Key wins:

- **Dependency Inversion:** use cases depend on `LeadRepository` / `WorkflowClient` interfaces; Prisma and Temporal become swappable details. Unit tests use in-memory fakes.
- **Open/Closed for enrichment providers:** the upcoming phone-enrichment feature needs an abstraction layer over three providers with different request/response shapes — a `PhoneProvider` port with one adapter per vendor is exactly this pattern, so the architecture pays for itself immediately.
- **Separate deployables:** `main.ts` (API) and `worker.ts` (Temporal worker) as independent processes.

### Concrete backend issues to fix along the way

| Issue | Where | Note |
|---|---|---|
| Async workflow executed synchronously in the HTTP request | `POST /leads/verify-emails` | Workflows run sequentially per lead and block the response; combined with a 1s `startToCloseTimeout` and default (infinite) retries on an activity that can sleep 20s, this is the "verification hangs forever" bug. Start workflows, return `202` + ids, poll/push status. |
| Non-idempotent workflow IDs | `verify-email-${lead.id}-${Date.now()}` | `Date.now()` defeats Temporal's dedup. Use deterministic ids (`verify-email-${lead.id}`) — also a stated requirement for the phone-enrichment workflow. |
| No input validation layer | all routes | Manual `typeof` checks, inconsistent between routes. Introduce zod schemas per endpoint; reject unknown fields. |
| API contract inconsistencies | `POST /leads` accepts `name` but stores `firstName`; `PATCH /leads/:id` silently drops `lastName`; frontend calls `PUT` but backend registers `PATCH` | Symptoms of no shared contract — see §3. |
| Row-by-row inserts in bulk import | `POST /leads/bulk` | One `INSERT` per lead in a loop. Use `createMany` inside a transaction. |
| Duplicate detection is name-based and case-inconsistent | `POST /leads/bulk` | Dedup by `firstName+lastName` (query is case-sensitive, in-memory check is lowercased). Dedup by email and enforce it with a `@unique` constraint in the schema instead of application-side checks. |
| Schema gaps | `prisma/schema.prisma` | `email` not unique, no indexes, `emailVerified Boolean?` is a tri-state — an enum/status field (`unverified/pending/valid/invalid`) models the verification lifecycle better and gives the UI something to show while a workflow runs. |
| Hand-rolled CORS, no security headers, no rate limiting | `index.ts` middleware | Replace with `cors` (restricted origin) + `helmet`. |
| Missing error handling | `POST/GET/PATCH/DELETE /leads/:id` have no try/catch; errors leak as 500s with Prisma internals | Central Express error middleware + typed domain errors (404 for missing lead, 409 for duplicates…). |
| `console.log` logging | everywhere | Structured logger (pino) with request ids. |
| No auth | all routes | Fine for a take-home, blocker for anything real. |

---

## 2. Frontend: same problem, different shape → feature-modular structure

### Current state

- `components/LeadsList.tsx` is a god component: query + two mutations + selection state + toolbar + dropdown + table + empty/error states + two modals + ~15 inline SVG icons. Any new feature (new columns, enrichment status, pagination) lands here and grows it further.
- Flat `components/` folder with no feature boundaries; the `api/` layer is actually the best-structured part of the frontend.
- Validation logic is duplicated and divergent between `utils/csvParser.ts` (frontend) and `POST /leads/bulk` (backend).
- Error recovery is `window.location.reload()` instead of `refetch()`; query keys are hand-typed string arrays repeated across files.
- `@tabler/icons-react` is installed but unused — every icon is a pasted SVG blob.
- `GET /leads` fetches everything with no pagination; the table will degrade at a few thousand rows.

### Recommendation

The project is small — full FSD (app/pages/widgets/features/entities/shared layering) adds ceremony we don't need yet. Go **modular by feature**, with FSD-compatible boundaries so we can formalize later if the app grows:

```
frontend/src/
  app/                 # App.tsx, Providers, router when it appears
  features/
    leads-table/       # table, selection hook, toolbar
    csv-import/        # modal, csvParser (it's feature logic, not a generic util)
    message-templates/ # modal, template field registry
    enrichment/        # verify-email / enrich-phone actions + status UI
  entities/
    lead/              # Lead type, query keys factory, lead API hooks
  shared/
    api/               # axios instance, endpoint() helper (already good)
    ui/                # Button, Modal, Checkbox, Spinner, Icon — extract from the Tailwind soup
```

Concrete steps:

1. Split `LeadsList` into `LeadsTable`, `LeadsToolbar`, `EnrichMenu`, and a `useLeadSelection` hook.
2. Add a query-key factory (`leadKeys.list()`, `leadKeys.detail(id)`) and use `queryClient.invalidateQueries(leadKeys.list())` everywhere.
3. Extract shared UI primitives (Button variants, Modal shell) — the same 200-char Tailwind class strings are copy-pasted across every button.
4. Replace inline SVGs with `@tabler/icons-react` (already a dependency).
5. Add an error boundary and use `refetch()` instead of full page reload.
6. Plan for server-side pagination/sorting on `GET /leads` before the table needs virtualization.

---

## 3. Cross-cutting: one source of truth for the API contract

Types are maintained twice (`frontend/src/api/types/leads/*` vs backend handlers) and have already drifted — the frontend's `update` uses `PUT`, the backend only registers `PATCH`, so lead editing is silently broken. Options, in order of preference for this codebase:

1. **pnpm workspace + shared `packages/contract`** with zod schemas per endpoint. Backend validates requests with them; frontend infers types from them. Cheap, incremental, no codegen.
2. tRPC — great fit for a TS-only monorepo, but a bigger rewrite of the API layer.
3. OpenAPI + codegen — better when non-TS consumers appear.

This also kills the FE/BE validation duplication: CSV rows get validated by the same schema in the import modal and in `POST /leads/bulk`.

---

## 4. Reliability & Temporal usage

- **Verification status must be observable.** Persist a per-lead verification/enrichment status (`pending/running/done/failed`) and expose it, instead of a boolean that flips at some unknown point. The UI polls the list (or we add SSE/WebSocket later) and shows progress — this is also the stated UX requirement for the phone-enrichment feature.
- **Activity timeouts/retries need to be deliberate.** `startToCloseTimeout: '1 second'` with the default unlimited retry policy is how the current hang happens. Every activity should declare an explicit retry policy (e.g. 3 attempts, exponential backoff) and a timeout that matches the provider's real latency.
- **Rename `workflows/activities/utils.ts`** — activities are the core of the worker, not utils. One file per activity domain (`email-verification.ts`, `phone-providers.ts`).
- **Rate limiting readiness:** providers will add RPS/RPM limits; Temporal worker-level `maxTaskQueueActivitiesPerSecond` per provider task queue (or an activity-level limiter) is the natural place to absorb that.

---

## 5. Tooling, DX & hygiene

| Item | Current | Proposal |
|---|---|---|
| CI | none | GitHub Actions: lint + typecheck + test + build on every PR |
| Backend linting | none (only Prettier) | Add ESLint (typescript-eslint) to match frontend |
| Pre-commit | none | husky + lint-staged (format + lint on staged files) |
| Local orchestration | 3 manual terminals (API, Temporal, frontend) | `docker-compose` for Temporal + a root-level `pnpm dev` that runs everything |
| Repo hygiene | `backend/prisma/dev.db` and `.DS_Store` committed; `frontend/.env` committed | gitignore all three, ship `.env.sample` on both sides |
| Database | SQLite | Fine for dev; plan Postgres for anything shared/production (Prisma makes this cheap if we don't lean on SQLite quirks) |
| Tests | 2 unit test files (`messageGenerator`, `csvParser`) | Use-case tests with in-memory repos (enabled by §1), Temporal workflow tests via `@temporalio/testing`, component tests for the import flow |
| Template fields | `availableFields` hardcoded in `messageGenerator.ts`, mirrored nowhere | Single field registry shared via the contract package — required anyway since the lead field list keeps growing (phone, LinkedIn, years at company…) |

---

## 6. Suggested roadmap

**Phase 1 — Stop the bleeding (fast, high value)**
- Fix `PUT` vs `PATCH` drift; fix verify-email timeout/retry policy; deterministic workflow ids
- Async workflow start + status field instead of blocking requests
- Central error middleware, zod validation on all routes
- gitignore `dev.db` / `.env` / `.DS_Store`; add CI (lint, typecheck, test)

**Phase 2 — Architecture**
- Backend: extract use-case + repository layers per §1, split API and worker entrypoints
- Frontend: feature-modular restructure per §2, split `LeadsList`, query-key factory, shared UI primitives
- pnpm workspace + shared zod contract package

**Phase 3 — Product-driven**
- Phone enrichment on the new provider-port abstraction, with rate-limit handling
- Server-side pagination + sorting on leads
- Verification/enrichment progress UI (poll first, SSE later)
- Postgres migration when we approach shared environments

Phases 1 and 2 deliberately front-load the structural work: the enrichment feature and the growing field list both get significantly cheaper once the ports/contract layers exist.

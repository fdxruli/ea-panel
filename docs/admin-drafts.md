# Admin Draft Infrastructure

The Admin Draft Store is a client-side recovery mechanism for unconfirmed work. It is intentionally independent from `CacheAdmin`.

## Layers

- Remote data: Supabase / `CacheAdmin`
- UI state: React state, hooks and contexts
- Work drafts: `AdminDraftContext` / `useAdminDraft` -> Dexie -> IndexedDB

No workflow is integrated in this phase.

## Draft model

A draft contains:

- `id`: unique draft identity; multiple drafts may coexist.
- `version`: storage schema version (`1` currently).
- `workflow`: workflow/screen identifier.
- `createdAt`: creation timestamp in milliseconds.
- `updatedAt`: last update timestamp in milliseconds.
- `expiresAt`: absolute expiration timestamp.
- `payload`: serializable work state only.
- `metadata`: minimal serializable metadata.

## TTL

The default TTL is 7 days (`DEFAULT_DRAFT_TTL_MS`). Callers may provide a positive `ttlMs` at creation and update time. The value is deliberately centralized and named rather than embedded as a magic number.

Expired drafts are never returned as valid drafts. Reads/lists can opportunistically remove expired or malformed records, and `clearExpiredDrafts()` provides explicit cleanup.

## Versioning

`ADMIN_DRAFT_SCHEMA_VERSION` is currently `1`. Every read validates the stored schema version. An incompatible version is rejected and removed safely rather than being restored into UI state.

When a future schema can be migrated safely, migration logic should be added before accepting the new version. Do not silently reinterpret an incompatible payload.

## Serialization contract

Payloads and metadata must be composed of plain objects, arrays, strings, booleans, finite numbers and `null`. Functions, Promises, React elements/references, AbortControllers, symbols, bigint values, circular references and other class instances are rejected.

Authentication tokens, credentials and secrets must never be placed in a draft payload.

## Persistence API

`src/lib/adminDraftStorage.js` provides:

- `createDraft`
- `getDraft`
- `updateDraft`
- `deleteDraft`
- `listDrafts`
- `hasDraft`
- `clearExpiredDrafts`
- `flushDraft`
- `createDebouncedDraftSaver`

`useAdminDraft()` exposes the same primitives plus workflow-friendly `load`, `exists`, `update`, `remove`, `flush` and `scheduleSave` helpers.

## Error isolation

IndexedDB availability is checked before opening the database. Storage errors are surfaced to callers so future workflow integrations can choose their own non-blocking fallback policy; the storage layer does not mutate React state or application routing. Debounced saves catch asynchronous write failures so an autosave failure does not become an unhandled rejection.

A future workflow integration must treat draft persistence as best-effort recovery, never as the source of truth for confirmed application data.

## Flush and debounce

`createDebouncedDraftSaver()` provides `schedule`, `flush` and `cancel`. The default delay is 500 ms. `flushDraft()` provides an explicit immediate persistence primitive for future `pagehide`/`visibilitychange` integration. Those browser lifecycle listeners are intentionally not installed in this phase.

## Cleanup

Cleanup is explicit and safe. Invalid or expired records encountered during reads/lists are removed, while `clearExpiredDrafts()` performs bulk cleanup. Cleanup is not wired into any existing Admin workflow in this phase.

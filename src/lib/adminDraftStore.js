import { adminDraftStorage } from './adminDraftStorage';
import {
    assertSerializable,
    createDraftRecord,
    DEFAULT_ADMIN_DRAFT_TTL_MS,
    isDraftExpired,
    migrateDraftRecord,
    validateDraftRecord
} from './adminDraftModel';

const createId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export class AdminDraftStore {
    constructor({ storage = adminDraftStorage, defaultTtlMs = DEFAULT_ADMIN_DRAFT_TTL_MS } = {}) {
        this.storage = storage;
        this.defaultTtlMs = defaultTtlMs;
        this.fallback = new Map();
        this.pending = new Map();
    }

    async createDraft({ id = createId(), ownerKey, workflow, entityType, entityId, payload, metadata, ttlMs } = {}) {
        const draft = createDraftRecord({
            id, ownerKey, workflow, entityType, entityId, payload, metadata, ttlMs: ttlMs ?? this.defaultTtlMs
        });
        const stored = await this.storage.create(draft);
        if (!stored) this.fallback.set(id, draft);
        return draft;
    }

    async getDraft(id) {
        if (!id) return null;
        const stored = await this.storage.get(id);
        const draft = stored ?? this.fallback.get(id) ?? null;
        const migrated = migrateDraftRecord(draft);
        if (!migrated) {
            if (draft) await this.deleteDraft(id);
            return null;
        }
        if (isDraftExpired(migrated)) {
            await this.deleteDraft(id);
            return null;
        }
        return migrated;
    }

    async updateDraft(id, patch = {}) {
        const current = await this.getDraft(id);
        if (!current) return null;

        if (patch.payload !== undefined) assertSerializable(patch.payload, 'payload');
        if (patch.metadata !== undefined) assertSerializable(patch.metadata, 'metadata');

        const next = {
            ...current,
            ...patch,
            id: current.id,
            ownerKey: current.ownerKey,
            workflow: current.workflow,
            schemaVersion: current.schemaVersion,
            createdAt: current.createdAt,
            updatedAt: new Date().toISOString()
        };

        if (!validateDraftRecord(next)) throw new TypeError('Invalid draft update.');
        const stored = await this.storage.update(id, next);
        if (!stored) this.fallback.set(id, next);
        return next;
    }

    async deleteDraft(id) {
        this.cancelScheduledSave(id);
        this.fallback.delete(id);
        return this.storage.delete(id);
    }

    async listDrafts(filters = {}) {
        const entries = await this.storage.list(filters);
        const fallbackEntries = [...this.fallback.values()].filter(draft => {
            if (filters.ownerKey && draft.ownerKey !== filters.ownerKey) return false;
            if (filters.workflow && draft.workflow !== filters.workflow) return false;
            if (filters.status && draft.status !== filters.status) return false;
            return true;
        });
        const byId = new Map([...entries, ...fallbackEntries].map(draft => [draft.id, draft]));
        const valid = [];
        for (const draft of byId.values()) {
            const migrated = migrateDraftRecord(draft);
            if (!migrated || isDraftExpired(migrated)) {
                await this.deleteDraft(draft.id);
                continue;
            }
            valid.push(migrated);
        }
        return valid.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }

    async hasDraft(id) {
        return Boolean(await this.getDraft(id));
    }

    async clearExpiredDrafts() {
        const removed = await this.storage.clearExpired();
        for (const [id, draft] of this.fallback) {
            if (isDraftExpired(draft)) this.fallback.delete(id);
        }
        return removed;
    }

    scheduleSave(id, patch, delayMs = 500) {
        this.cancelScheduledSave(id);
        const timer = setTimeout(async () => {
            this.pending.delete(id);
            try {
                await this.updateDraft(id, patch);
            } catch (error) {
                console.warn(`[AdminDraftStore] Autosave failed for ${id}:`, error);
            }
        }, delayMs);
        this.pending.set(id, { timer, patch });
    }

    async flushDraft(id, patch) {
        const pending = this.pending.get(id);
        if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(id);
            patch = patch ?? pending.patch;
        }
        return patch ? this.updateDraft(id, patch) : this.getDraft(id);
    }

    cancelScheduledSave(id) {
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
    }
}

export const adminDraftStore = new AdminDraftStore();

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useAdminAuth } from './AdminAuthContext';
import {
  clearExpiredDrafts,
  createDebouncedDraftSaver,
  createDraft as createStoredDraft,
  deleteDraft as deleteStoredDraft,
  flushDraft as flushStoredDraft,
  getDraft as getStoredDraft,
  listDrafts as listStoredDrafts,
  updateDraft as updateStoredDraft,
} from '../lib/adminDraftStorage';

const AdminDraftContext = createContext(null);

export const AdminDraftProvider = ({ children }) => {
  const { status, userId } = useAdminAuth();
  const ownerKey = status === 'ADMIN' ? userId : null;
  const ownerKeyRef = useRef(ownerKey);
  const saversRef = useRef(new Map());

  const cancelAllScheduledSaves = useCallback(() => {
    for (const saver of saversRef.current.values()) saver.cancel();
    saversRef.current.clear();
  }, []);

  useEffect(() => {
    if (ownerKeyRef.current !== ownerKey) {
      ownerKeyRef.current = ownerKey;
      cancelAllScheduledSaves();
    }
  }, [ownerKey, cancelAllScheduledSaves]);

  const requireOwner = useCallback(() => {
    if (!ownerKey) throw new Error('ADMIN_DRAFT_OWNER_REQUIRED');
    return ownerKey;
  }, [ownerKey]);

  const getScopedDraft = useCallback(async (id) => {
    const currentOwner = ownerKey;
    if (!currentOwner || !id) return null;
    const draft = await getStoredDraft(id);
    return draft?.ownerKey === currentOwner ? draft : null;
  }, [ownerKey]);

  const createScopedDraft = useCallback((options) => (
    createStoredDraft({ ...options, ownerKey: requireOwner() })
  ), [requireOwner]);

  const updateScopedDraft = useCallback(async (id, changes, options) => {
    const currentOwner = requireOwner();
    const existing = await getStoredDraft(id, options);
    if (!existing || existing.ownerKey !== currentOwner) return null;
    return updateStoredDraft(id, changes, options);
  }, [requireOwner]);

  const deleteScopedDraft = useCallback(async (id) => {
    const currentOwner = requireOwner();
    const existing = await getStoredDraft(id);
    if (!existing || existing.ownerKey !== currentOwner) return;
    await deleteStoredDraft(id);
  }, [requireOwner]);

  const listScopedDrafts = useCallback((options = {}) => {
    if (!ownerKey) return Promise.resolve([]);
    return listStoredDrafts({ ...options, ownerKey });
  }, [ownerKey]);

  const hasScopedDraft = useCallback(async (id) => Boolean(await getScopedDraft(id)), [getScopedDraft]);

  const findScopedDraft = useCallback((context) => {
    if (!ownerKey) return Promise.resolve(null);
    return listStoredDrafts({ ...context, ownerKey }).then((drafts) => drafts[0] ?? null);
  }, [ownerKey]);

  const scheduleSave = useCallback((id, draft, delayMs = 500) => {
    const currentOwner = requireOwner();
    if (!draft || draft.ownerKey !== currentOwner) return;
    let saver = saversRef.current.get(id);
    if (!saver) {
      saver = createDebouncedDraftSaver((value) => flushStoredDraft(value), delayMs);
      saversRef.current.set(id, saver);
    }
    saver.schedule(draft);
  }, [requireOwner]);

  const flush = useCallback(async (id, draft) => {
    const currentOwner = requireOwner();
    const existing = await getStoredDraft(id);
    if (!existing || existing.ownerKey !== currentOwner) return null;
    const saver = saversRef.current.get(id);
    if (saver) {
      await saver.flush();
      saversRef.current.delete(id);
      return getScopedDraft(id);
    }
    return flushStoredDraft(draft);
  }, [requireOwner, getScopedDraft]);

  const cancelScheduledSave = useCallback((id) => {
    const saver = saversRef.current.get(id);
    saver?.cancel();
    saversRef.current.delete(id);
  }, []);

  useEffect(() => () => cancelAllScheduledSaves(), [cancelAllScheduledSaves]);

  const value = useMemo(() => ({
    ownerKey,
    createDraft: createScopedDraft,
    getDraft: getScopedDraft,
    updateDraft: updateScopedDraft,
    deleteDraft: deleteScopedDraft,
    listDrafts: listScopedDrafts,
    findDraft: findScopedDraft,
    hasDraft: hasScopedDraft,
    clearExpiredDrafts,
    scheduleSave,
    flushDraft: flush,
    cancelScheduledSave,
  }), [ownerKey, createScopedDraft, getScopedDraft, updateScopedDraft, deleteScopedDraft, listScopedDrafts, findScopedDraft, hasScopedDraft, scheduleSave, flush, cancelScheduledSave]);

  return <AdminDraftContext.Provider value={value}>{children}</AdminDraftContext.Provider>;
};

export const useAdminDraftContext = () => {
  const context = useContext(AdminDraftContext);
  if (!context) throw new Error('useAdminDraftContext must be used inside AdminDraftProvider');
  return context;
};

export { AdminDraftContext };

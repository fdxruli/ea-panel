import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import {
  clearExpiredDrafts,
  createDebouncedDraftSaver,
  createDraft,
  deleteDraft,
  flushDraft,
  getDraft,
  hasDraft,
  listDrafts,
  updateDraft,
} from '../lib/adminDraftStorage';

const AdminDraftContext = createContext(null);

export const AdminDraftProvider = ({ children }) => {
  const saversRef = useRef(new Map());

  const scheduleSave = useCallback((id, draft, delayMs = 500) => {
    let saver = saversRef.current.get(id);
    if (!saver) {
      saver = createDebouncedDraftSaver((value) => flushDraft(value), delayMs);
      saversRef.current.set(id, saver);
    }
    saver.schedule(draft);
  }, []);

  const flush = useCallback(async (id, draft) => {
    const saver = saversRef.current.get(id);
    if (saver) {
      await saver.flush();
      saversRef.current.delete(id);
      return getDraft(id);
    }
    return flushDraft(draft);
  }, []);

  const cancelScheduledSave = useCallback((id) => {
    const saver = saversRef.current.get(id);
    saver?.cancel();
    saversRef.current.delete(id);
  }, []);

  const remove = useCallback(async (id) => {
    cancelScheduledSave(id);
    await deleteDraft(id);
  }, [cancelScheduledSave]);

  const value = useMemo(() => ({
    createDraft,
    getDraft,
    updateDraft,
    deleteDraft: remove,
    listDrafts,
    hasDraft,
    clearExpiredDrafts,
    scheduleSave,
    flushDraft: flush,
    cancelScheduledSave,
  }), [scheduleSave, flush, cancelScheduledSave, remove]);

  return <AdminDraftContext.Provider value={value}>{children}</AdminDraftContext.Provider>;
};

export const useAdminDraftContext = () => {
  const context = useContext(AdminDraftContext);
  if (!context) throw new Error('useAdminDraftContext must be used inside AdminDraftProvider');
  return context;
};

export { AdminDraftContext };

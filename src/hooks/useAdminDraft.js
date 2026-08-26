import { useCallback } from 'react';
import { useAdminDraftContext } from '../context/AdminDraftContext';

export const useAdminDraft = (draftId = null) => {
  const store = useAdminDraftContext();
  const load = useCallback(() => (draftId ? store.getDraft(draftId) : Promise.resolve(null)), [draftId, store]);
  const exists = useCallback(() => (draftId ? store.hasDraft(draftId) : Promise.resolve(false)), [draftId, store]);
  const update = useCallback((changes, options) => (draftId ? store.updateDraft(draftId, changes, options) : Promise.reject(new Error('draftId is required'))), [draftId, store]);
  const remove = useCallback(() => (draftId ? store.deleteDraft(draftId) : Promise.resolve()), [draftId, store]);
  const flush = useCallback((draft) => (draftId ? store.flushDraft(draftId, draft) : Promise.reject(new Error('draftId is required'))), [draftId, store]);
  const scheduleSave = useCallback((draft, delayMs) => (draftId ? store.scheduleSave(draftId, draft, delayMs) : undefined), [draftId, store]);
  return { ...store, load, exists, update, remove, flush, scheduleSave };
};

export default useAdminDraft;

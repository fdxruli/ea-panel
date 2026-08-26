import { useCallback, useEffect, useRef, useState } from 'react';
import { adminDraftStore } from '../lib/adminDraftStore';

export const useAdminDraft = ({ draftId = null, ownerKey = null, workflow = null, autosaveDelayMs = 500 } = {}) => {
    const [draft, setDraft] = useState(null);
    const [isLoading, setIsLoading] = useState(Boolean(draftId));
    const [persistenceError, setPersistenceError] = useState(null);
    const activeIdRef = useRef(draftId);

    const loadDraft = useCallback(async (id = activeIdRef.current) => {
        if (!id) {
            setDraft(null);
            setIsLoading(false);
            return null;
        }
        setIsLoading(true);
        try {
            const result = await adminDraftStore.getDraft(id);
            setDraft(result);
            setPersistenceError(null);
            return result;
        } catch (error) {
            setPersistenceError(error);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        activeIdRef.current = draftId;
        loadDraft(draftId);
    }, [draftId, loadDraft]);

    const createDraft = useCallback(async payload => {
        try {
            const result = await adminDraftStore.createDraft({ ownerKey, workflow, payload });
            activeIdRef.current = result.id;
            setDraft(result);
            setPersistenceError(null);
            return result;
        } catch (error) {
            setPersistenceError(error);
            throw error;
        }
    }, [ownerKey, workflow]);

    const updateDraft = useCallback(async patch => {
        const id = activeIdRef.current;
        if (!id) return null;
        try {
            const result = await adminDraftStore.updateDraft(id, patch);
            setDraft(result);
            setPersistenceError(null);
            return result;
        } catch (error) {
            setPersistenceError(error);
            return draft;
        }
    }, [draft]);

    const scheduleSave = useCallback(patch => {
        const id = activeIdRef.current;
        if (!id) return;
        adminDraftStore.scheduleSave(id, patch, autosaveDelayMs);
        setDraft(current => current ? { ...current, ...patch } : current);
    }, [autosaveDelayMs]);

    const flushDraft = useCallback(async patch => {
        const id = activeIdRef.current;
        if (!id) return null;
        const result = await adminDraftStore.flushDraft(id, patch);
        setDraft(result);
        return result;
    }, []);

    const deleteDraft = useCallback(async () => {
        const id = activeIdRef.current;
        if (!id) return false;
        const result = await adminDraftStore.deleteDraft(id);
        activeIdRef.current = null;
        setDraft(null);
        return result;
    }, []);

    const hasDraft = useCallback(async (id = activeIdRef.current) => Boolean(id && await adminDraftStore.hasDraft(id)), []);

    return {
        draft,
        draftId: activeIdRef.current,
        isLoading,
        persistenceError,
        createDraft,
        loadDraft,
        updateDraft,
        scheduleSave,
        flushDraft,
        deleteDraft,
        hasDraft
    };
};

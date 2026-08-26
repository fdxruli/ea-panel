import React, { createContext, useContext, useMemo } from 'react';
import { adminDraftStore } from '../lib/adminDraftStore';

export const AdminDraftContext = createContext(null);

export const AdminDraftProvider = ({ children, store = adminDraftStore }) => {
    const value = useMemo(() => ({
        store,
        createDraft: options => store.createDraft(options),
        getDraft: id => store.getDraft(id),
        updateDraft: (id, patch) => store.updateDraft(id, patch),
        deleteDraft: id => store.deleteDraft(id),
        listDrafts: filters => store.listDrafts(filters),
        hasDraft: id => store.hasDraft(id),
        clearExpiredDrafts: () => store.clearExpiredDrafts(),
        flushDraft: (id, patch) => store.flushDraft(id, patch),
        scheduleSave: (id, patch, delayMs) => store.scheduleSave(id, patch, delayMs)
    }), [store]);

    return <AdminDraftContext.Provider value={value}>{children}</AdminDraftContext.Provider>;
};

export const useAdminDraftContext = () => {
    const context = useContext(AdminDraftContext);
    if (!context) throw new Error('useAdminDraftContext must be used inside AdminDraftProvider.');
    return context;
};

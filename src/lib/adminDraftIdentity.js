export const getAdminDraftOwnerKey = ({ status, userId } = {}) => (
  status === 'ADMIN' && typeof userId === 'string' && userId ? userId : null
);

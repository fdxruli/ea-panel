# Draft schema version 1

Version `1` requires `id`, `version`, `workflow`, `createdAt`, `updatedAt`, `expiresAt`, `payload`, and `metadata`.

Reads reject incompatible versions and remove malformed records safely. Future versions must add explicit migration functions before they are accepted; incompatible records must never be restored into workflow state.

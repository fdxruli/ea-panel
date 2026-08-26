# Admin Draft tests

The draft storage tests use Node's built-in `node:test` runner and `fake-indexeddb` to exercise the real Dexie storage API without requiring a browser.

The test suite covers CRUD, multiple-draft isolation, workflow filtering, TTL/expiration, cleanup and serialization rejection.

import { defineConfig } from 'vitest/config';

// npm scope @complianceos and the root workspace name "compliance-os" stay.
// Renaming them would break workspace installs, lockfile resolution, and CI.
// The runnable suite lives in @complianceos/core. Root-level tests under
// test/ and tests/ still import the pre-workspace layout (../routers, ../lib)
// and are not part of this command.
export default defineConfig({
    test: {
        projects: ['packages/core'],
    },
});

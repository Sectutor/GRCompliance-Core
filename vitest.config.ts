import { defineConfig } from 'vitest/config';

// The runnable suite lives in @complianceos/core. Root-level tests under
// test/ and tests/ still import the pre-workspace layout (../routers, ../lib)
// and are not part of this command.
export default defineConfig({
    test: {
        projects: ['packages/core'],
    },
});

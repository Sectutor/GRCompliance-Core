// Loads the same module graph as `tsx server_entry.ts` and exits.
// A missing relative import (for example the SoA export handler) fails here
// instead of only when an operator starts the server. Vite's client build
// does not import this entry.

// Community boot (AUTH_MODE=local) is what actually loads the export router.
// The Supabase default exits in auth middleware before that import runs.
// Development skips the production secrets gate, which runs after imports.
process.env.AUTH_MODE = "local";
process.env.NODE_ENV = "development";
process.env.ENABLE_POLICY_REVIEW_SCHEDULER = "false";
process.env.ENABLE_THREAT_SCHEDULER = "false";
process.env.ENABLE_LICENSE_RENEWAL_SCHEDULER = "false";
process.env.PORT = "0";

try {
    await import("../server_entry.ts");
} catch (error) {
    console.error("[check:server] failed to import server_entry.ts");
    console.error(error);
    process.exit(1);
}

console.log("[check:server] server entry imported");
process.exit(0);

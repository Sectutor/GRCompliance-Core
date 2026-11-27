/**
 * @vitest-environment node
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const install = path.resolve(__dirname, "../../../../install.sh");

function bash(script: string): string {
    return execFileSync("bash", ["-c", script], {
        encoding: "utf8",
        env: { ...process.env, GRC_INSTALL_LIB: "1" },
    });
}

describe("installer prompts and crash detection", () => {
    it("answers no when there is no terminal, without a device error", () => {
        const output = bash(`
          source "${install}"
          set +e
          prompt_yes "Install Docker for me?" </dev/null 2>&1
          code=$?
          echo "EXIT:$code"
        `);
        expect(output).toContain("No terminal is attached");
        expect(output).toContain("EXIT:1");
        expect(output).not.toContain("No such device or address");
    });

    it("stops when the app container is restarting", () => {
        const output = bash(`
          source "${install}"
          app_watch_reset
          APP_STATUS=restarting
          APP_RESTARTS=1
          APP_POLICY=unless-stopped
          app_watch_observe
          APP_STATUS=restarting
          APP_RESTARTS=2
          app_watch_observe
          printf '%s\n' "$APP_WATCH_REASON"
        `);
        expect(output.trim()).toBe("crash-loop");
    });

    it("redacts .env secrets from the log tail", () => {
        const output = bash(`
          source "${install}"
          tmp=$(mktemp -d)
          cd "$tmp"
          printf 'ADMIN_PASSWORD=supersecretvalue\n' > .env
          compose_cmd() { printf '%s\n' "boot failed supersecretvalue"; }
          redacted_app_logs
          rm -rf "$tmp"
        `);
        expect(output).toContain("***");
        expect(output).not.toContain("supersecretvalue");
    });
});

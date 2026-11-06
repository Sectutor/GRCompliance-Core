/**
 * Disposable stand-in for the Core app. Two local tags of this image simulate
 * N and N+1 when GHCR has a single published tag. It speaks /health, records
 * schema_version, keeps a marker row and an uploads file, and proxies the
 * admin update API to the real sidecar. It is not the product UI.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";

const port = Number(process.env.PORT || 3001);
const version = process.env.PROOF_VERSION || "1.0.0";
const schemaVersion = Number(process.env.PROOF_SCHEMA || 1);
const fail = process.env.PROOF_FAIL === "1";
const uploads = process.env.UPLOADS_DIR || "/app/uploads";
const updaterUrl = process.env.UPDATER_URL || "http://updater:9090";
const updaterSecret = process.env.UPDATER_SECRET || "";

function databaseParts() {
    const url = new URL(process.env.DATABASE_URL);
    return {
        host: url.hostname,
        port: url.port || "5432",
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    };
}

function psql(sql) {
    const db = databaseParts();
    return new Promise((resolve, reject) => {
        const child = spawn("psql", [
            "-h", db.host,
            "-p", db.port,
            "-U", db.user,
            "-d", db.database,
            "-v", "ON_ERROR_STOP=1",
            "-tAc", sql,
        ], {
            env: { ...process.env, PGPASSWORD: db.password },
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) resolve(stdout.trim());
            else reject(new Error(stderr || `psql exited ${code}`));
        });
    });
}

async function boot() {
    await mkdir(uploads, { recursive: true });
    const markerFile = `${uploads}/marker.txt`;
    try {
        await readFile(markerFile);
    } catch {
        await writeFile(markerFile, "uploads-marker\n");
    }
    await psql(`
        CREATE TABLE IF NOT EXISTS schema_meta (
            id integer PRIMARY KEY,
            schema_version integer NOT NULL,
            app_version text,
            updated_at timestamp DEFAULT now(),
            CONSTRAINT schema_meta_singleton CHECK (id = 1)
        )
    `);
    await psql(`
        CREATE TABLE IF NOT EXISTS proof_marker (
            id integer PRIMARY KEY,
            note text NOT NULL
        )
    `);
    if (schemaVersion >= 2) {
        await psql("ALTER TABLE proof_marker ADD COLUMN IF NOT EXISTS extra text");
    }
    await psql(`
        INSERT INTO schema_meta (id, schema_version, app_version)
        VALUES (1, ${schemaVersion}, '${version.replace(/'/g, "")}')
        ON CONFLICT (id) DO UPDATE
        SET schema_version = GREATEST(schema_meta.schema_version, EXCLUDED.schema_version),
            app_version = EXCLUDED.app_version,
            updated_at = now()
    `);
    await psql(`
        INSERT INTO proof_marker (id, note)
        VALUES (1, 'latore-marker')
        ON CONFLICT (id) DO NOTHING
    `);
    if (schemaVersion >= 2) {
        await psql("UPDATE proof_marker SET extra = COALESCE(extra, 'kept') WHERE id = 1");
    }
}

async function marker() {
    const note = await psql("SELECT note FROM proof_marker WHERE id = 1");
    let extra = "";
    try {
        extra = await psql("SELECT COALESCE(extra, '') FROM proof_marker WHERE id = 1");
    } catch {
        extra = "";
    }
    const schema = await psql("SELECT schema_version FROM schema_meta WHERE id = 1");
    let uploadsMarker = "";
    try {
        uploadsMarker = (await readFile(`${uploads}/marker.txt`, "utf8")).trim();
    } catch {
        uploadsMarker = "";
    }
    return { note, extra, schemaVersion: Number(schema), uploadsMarker, version };
}

function send(res, status, body, type = "application/json") {
    const payload = type === "application/json" ? JSON.stringify(body) : body;
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(payload);
}

function page(data, status) {
    const available = status?.available;
    const button = available
        ? `<button id="upgrade-now" data-testid="upgrade-now">Update available → Upgrade now</button>`
        : `<button id="upgrade-now" data-testid="upgrade-now" disabled>Up to date</button>`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>GRCompliance Core updates</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; margin: 2rem auto; max-width: 42rem; color: #142033; background: #f4f7fb; }
    main { background: white; border: 1px solid #d5deea; border-radius: 12px; padding: 1.5rem; }
    h1 { margin: 0 0 .25rem; font-size: 1.4rem; }
    p { line-height: 1.45; }
    button { background: #1d4ed8; color: white; border: 0; border-radius: 8px; padding: .7rem 1rem; font-size: 1rem; }
    button:disabled { background: #94a3b8; }
    .bar { height: 10px; background: #e2e8f0; border-radius: 99px; overflow: hidden; margin: 1rem 0; }
    .bar span { display: block; height: 100%; background: #1d4ed8; width: ${status?.progress || 0}%; }
    code { background: #eef2ff; padding: .1rem .3rem; }
  </style>
</head>
<body>
  <main>
    <p>Community edition</p>
    <h1>Software updates</h1>
    <p>Current version <strong data-testid="current-version">${data.version}</strong>. Schema <span data-testid="schema-version">${data.schemaVersion}</span>.</p>
    <p>Marker <span data-testid="marker">${data.note}</span> ${data.extra ? `(${data.extra})` : ""}. Uploads <span data-testid="uploads">${data.uploadsMarker}</span>.</p>
    <p>${available ? `Update available: ${available.version}. ${available.notes || ""}` : (status?.message || "Checking for updates.")}</p>
    ${button}
    <div class="bar" data-testid="update-progress"><span></span></div>
    <p data-testid="update-state">${status?.state || "idle"} ${status?.rolledBack ? "rolled back" : ""} ${status?.error || ""}</p>
    <p>This updates the Core container. It does not enable Premium or change the workspace cap.</p>
  </main>
  <script>
    const button = document.querySelector("#upgrade-now");
    async function refresh() {
      const res = await fetch("/api/updates/status");
      if (!res.ok) return;
      const body = await res.json();
      const active = ["disk_check","backing_up","pulling","recreating","waiting_healthy","rolling_back","restoring_database"].includes(body.state);
      if (!active && (body.state === "succeeded" || body.state === "failed" || body.rolledBack)) {
        location.reload();
      }
    }
    if (button && !button.disabled) {
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Upgrading…";
        await fetch("/api/updates/upgrade", { method: "POST" });
        setInterval(refresh, 1000);
      });
    }
  </script>
</body>
</html>`;
}

async function proxy(req, res, targetPath) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const upstream = await fetch(`${updaterUrl}${targetPath}`, {
        method: req.method,
        headers: {
            Authorization: `Bearer ${updaterSecret}`,
            "Content-Type": "application/json",
        },
        body: req.method === "GET" ? undefined : Buffer.concat(chunks),
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(text);
    return text;
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url || "/", "http://app");
        if (url.pathname === "/health") {
            const schema = await psql("SELECT schema_version FROM schema_meta WHERE id = 1").catch(() => String(schemaVersion));
            const body = {
                status: fail ? "error" : "ok",
                database: "connected",
                edition: "core",
                version,
                schemaVersion: Number(schema),
                fatal: fail,
            };
            send(res, fail ? 500 : 200, body);
            return;
        }
        if (url.pathname === "/api/proof") {
            send(res, 200, await marker());
            return;
        }
        if (url.pathname === "/api/updates/status") {
            await proxy(req, res, "/v1/status");
            return;
        }
        if (url.pathname === "/api/updates/check" && req.method === "POST") {
            await proxy(req, res, "/v1/check");
            return;
        }
        if (url.pathname === "/api/updates/upgrade" && req.method === "POST") {
            await proxy(req, res, "/v1/upgrade");
            return;
        }
        if (url.pathname === "/") {
            let status = {};
            const hold = url.searchParams.get("hold") === "1";
            try {
                const upstream = await fetch(`${updaterUrl}${hold ? "/v1/status" : "/v1/check"}`, {
                    method: hold ? "GET" : "POST",
                    headers: { Authorization: `Bearer ${updaterSecret}` },
                });
                status = await upstream.json();
            } catch (error) {
                status = { state: "idle", message: error instanceof Error ? error.message : "Updater unavailable" };
            }
            send(res, 200, page(await marker(), status), "text/html; charset=utf-8");
            return;
        }
        send(res, 404, { error: "Not found" });
    } catch (error) {
        send(res, 500, { error: error instanceof Error ? error.message : "failed" });
    }
});

boot().then(() => {
    server.listen(port, "0.0.0.0", () => {
        console.log(`[proof] ${version} schema ${schemaVersion} fail=${fail} listening on ${port}`);
    });
}).catch((error) => {
    console.error("[proof] boot failed", error instanceof Error ? error.message : error);
    process.exit(1);
});

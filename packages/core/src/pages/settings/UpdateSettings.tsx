import { useEffect, useState } from "react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Button } from "@complianceos/ui/ui/button";
import { authedFetch } from "@/lib/authedFetch";
import { Loader2 } from "lucide-react";

type ReleaseImage = { name: string; tag: string; digest: string };
type ReleaseManifest = {
    edition: "core";
    version: string;
    notes?: string;
    changelogUrl?: string;
    image?: ReleaseImage;
    minSchemaVersion?: number;
};

export type UpdateStatus = {
    edition: "core";
    updater: "ok" | "unavailable";
    currentVersion: string;
    schemaVersion: number;
    airgap: boolean;
    state: string;
    progress: number;
    message: string | null;
    error: string | null;
    available: ReleaseManifest | null;
    rolledBack: boolean;
    canUpgrade: boolean;
    runId: string | null;
};

const ACTIVE = new Set([
    "disk_check",
    "backing_up",
    "pulling",
    "recreating",
    "waiting_healthy",
    "rolling_back",
    "restoring_database",
]);

async function readUpdate(url: string, method = "GET"): Promise<{ status: number; body: UpdateStatus | { error?: string } }> {
    const response = await authedFetch(url, method === "GET" ? undefined : { method });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
}

export default function UpdateSettings() {
    const [status, setStatus] = useState<UpdateStatus | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let timer: ReturnType<typeof setInterval> | undefined;
        let stopped = false;

        const apply = (next: UpdateStatus) => {
            if (!stopped) setStatus(next);
            if (ACTIVE.has(next.state)) {
                if (!timer) timer = setInterval(() => void poll(), 1000);
            } else if (timer) {
                clearInterval(timer);
                timer = undefined;
            }
        };

        const poll = async () => {
            const result = await readUpdate("/api/updates/status");
            if (result.status === 401 || result.status === 403) {
                setForbidden(true);
                return;
            }
            apply(result.body as UpdateStatus);
        };

        const load = async () => {
            const current = await readUpdate("/api/updates/status");
            if (current.status === 401 || current.status === 403) {
                setForbidden(true);
                return;
            }
            const initial = current.body as UpdateStatus;
            apply(initial);
            if (initial.airgap || initial.updater !== "ok" || ACTIVE.has(initial.state)) return;
            const checked = await readUpdate("/api/updates/check", "POST");
            if (checked.status === 403) {
                apply({ ...initial, ...(checked.body as UpdateStatus), airgap: true, canUpgrade: false });
                return;
            }
            if (checked.status >= 200 && checked.status < 300) apply(checked.body as UpdateStatus);
        };

        void load();
        return () => {
            stopped = true;
            if (timer) clearInterval(timer);
        };
    }, []);

    const upgrade = async () => {
        setBusy(true);
        try {
            const result = await readUpdate("/api/updates/upgrade", "POST");
            if (result.status === 401 || result.status === 403) {
                setForbidden(true);
                return;
            }
            setStatus(result.body as UpdateStatus);
        } finally {
            setBusy(false);
        }
    };

    if (forbidden) {
        return (
            <div className="space-y-4 p-6">
                <h1 className="text-2xl font-semibold">Software updates</h1>
                <p>Only an administrator can update this instance.</p>
            </div>
        );
    }

    const available = status?.available;
    const buttonLabel = available ? "Update available → Upgrade now" : status?.airgap ? "Updates disabled" : "Up to date";

    return (
        <div className="space-y-6 p-6 max-w-3xl">
            <Breadcrumb items={[{ label: "Settings", href: "/settings" }, { label: "Updates" }]} />
            <div>
                <p className="text-sm text-muted-foreground">Community edition</p>
                <h1 className="text-2xl font-semibold">Software updates</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    This replaces the Core container with a pinned release. It does not enable Premium
                    and it does not change the Community workspace cap. The app never receives the Docker socket.
                </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                    <dt className="text-muted-foreground">Current version</dt>
                    <dd data-testid="current-version">{status?.currentVersion || "…"}</dd>
                </div>
                <div>
                    <dt className="text-muted-foreground">Schema version</dt>
                    <dd data-testid="schema-version">{status?.schemaVersion ?? "…"}</dd>
                </div>
            </dl>
            {available && (
                <div className="rounded-md border p-4 text-sm">
                    <p>Version {available.version} is available.</p>
                    {available.notes ? <p className="mt-2 whitespace-pre-wrap">{available.notes}</p> : null}
                    {available.changelogUrl ? (
                        <a className="mt-2 inline-block underline" href={available.changelogUrl}>Changelog</a>
                    ) : null}
                </div>
            )}
            <Button
                data-testid="upgrade-now"
                disabled={!status?.canUpgrade || busy}
                onClick={() => void upgrade()}
            >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {buttonLabel}
            </Button>
            {status && (ACTIVE.has(status.state) || status.progress > 0) && (
                <div>
                    <div className="h-2 overflow-hidden rounded bg-slate-200" data-testid="update-progress">
                        <div className="h-full bg-blue-700" style={{ width: `${status.progress || 0}%` }} />
                    </div>
                    <p className="mt-2 text-sm" data-testid="update-state">
                        {status.message || status.state}
                        {status.rolledBack ? " Rolled back to the previous version." : ""}
                    </p>
                </div>
            )}
            {status?.error && status.state === "failed" ? <p className="text-sm text-red-700">{status.error}</p> : null}
            {status?.updater === "unavailable" ? <p className="text-sm">The updater sidecar is not reachable. The manual command below still works.</p> : null}
            <div className="text-sm text-muted-foreground">
                <p>Manual fallback, from any directory:</p>
                <pre className="mt-2 overflow-auto rounded bg-slate-950 p-3 text-slate-50">curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash -s -- --upgrade</pre>
                <p className="mt-2">If the new container does not become healthy, the sidecar starts the previous image again. A database change is restored from the backup taken at the start of the attempt.</p>
            </div>
        </div>
    );
}

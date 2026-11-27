import { useEffect, useState } from "react";
import { Button } from "@complianceos/ui/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@complianceos/ui/ui/card";
import { authedFetch } from "@/lib/authedFetch";
import { backupStatusSentences, type BackupRecord, type RestoreTest } from "@/lib/backupStatus";

type Payload = {
    version: string;
    updateAvailable: boolean;
    backups: BackupRecord[];
    restoreTest: RestoreTest;
    message?: string;
};

export function BackupStatusCard() {
    const [payload, setPayload] = useState<Payload | null>(null);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);

    const load = async () => {
        const response = await authedFetch("/api/updates/backups");
        if (!response.ok) return;
        setPayload(await response.json());
    };

    useEffect(() => {
        void load();
    }, []);

    const verify = async () => {
        const id = payload?.backups?.[0]?.id;
        if (!id) {
            setNote("There is no backup to check yet.");
            return;
        }
        setBusy(true);
        try {
            const response = await authedFetch("/api/updates/backups/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            const body = await response.json().catch(() => ({}));
            setNote(typeof body.message === "string" ? body.message : "We could not check this backup. The live database was not changed.");
            await load();
        } finally {
            setBusy(false);
        }
    };

    const lines = payload
        ? backupStatusSentences({
            now: new Date(),
            version: payload.version,
            updateAvailable: payload.updateAvailable,
            backups: payload.backups || [],
            restoreTest: payload.restoreTest,
        })
        : ["Last backup: checking…", "Restore tested: checking…", "Version …"];

    return (
        <Card data-testid="backup-status">
            <CardHeader className="pb-2">
                <CardTitle className="text-base">Backup and updates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
                {lines.map((line) => <p key={line}>{line}</p>)}
                <Button type="button" variant="outline" size="sm" onClick={() => void verify()} disabled={busy}>
                    {busy ? "Checking…" : "Check a restore"}
                </Button>
                {note ? <p className="text-muted-foreground">{note}</p> : null}
            </CardContent>
        </Card>
    );
}

import { useState } from "react";
import { Button } from "@complianceos/ui/ui/button";
import { toast } from "sonner";
import { SpreadsheetMapper } from "./SpreadsheetMapper";

export function SpreadsheetDropzone({ clientId, onDone }: { clientId: number; onDone?: () => void }) {
    const [parsed, setParsed] = useState<{ headers: string[]; data: Record<string, unknown>[] } | null>(null);

    const onFile = async (file: File | undefined) => {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".csv")) {
            toast.error("This edition reads a CSV file. Download a template if you need the columns.");
            return;
        }
        const { default: Papa } = await import("papaparse");
        Papa.parse<Record<string, unknown>>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const rows = (results.data || []).filter((row) => Object.values(row).some((value) => String(value ?? "").trim() !== ""));
                if (rows.length === 0) {
                    toast.error("That file has no rows.");
                    return;
                }
                setParsed({ headers: Object.keys(rows[0]), data: rows });
            },
            error: () => toast.error("We could not read that file."),
        });
    };

    if (parsed) {
        return (
            <SpreadsheetMapper
                clientId={clientId}
                headers={parsed.headers}
                data={parsed.data}
                kinds={["controls", "risks"]}
                embedded
                onCancel={() => setParsed(null)}
                onSuccess={() => {
                    setParsed(null);
                    onDone?.();
                }}
            />
        );
    }

    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
                Bring a controls or risks spreadsheet. We check it here before saving. The file is not sent to us.
            </p>
            <label className="inline-flex items-center gap-3">
                <input
                    type="file"
                    accept=".csv,text/csv"
                    className="text-sm"
                    onChange={(event) => void onFile(event.target.files?.[0])}
                />
            </label>
            {onDone ? <Button type="button" variant="ghost" size="sm" onClick={() => onDone()}>Skip for now</Button> : null}
        </div>
    );
}

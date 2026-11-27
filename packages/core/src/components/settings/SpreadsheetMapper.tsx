import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@complianceos/ui/ui/card";
import { Button } from "@complianceos/ui/ui/button";
import { Input } from "@complianceos/ui/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@complianceos/ui/ui/select";
import { Loader2, ArrowRight, CheckCircle2, ChevronLeft, Table as TableIcon, AlertCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@complianceos/ui/ui/table";
import { isCommunityEdition as communityFromFlag } from "@/lib/edition";
import { downloadSpreadsheetTemplate } from "@/lib/spreadsheetTemplates";

interface SpreadsheetMapperProps {
    clientId: number;
    headers: string[];
    data: Record<string, unknown>[];
    onCancel: () => void;
    onSuccess: () => void;
    kinds?: ImportType[];
    embedded?: boolean;
}

type ImportType = "controls" | "risks" | "assets" | "policies";

const FIELD_DEFINITIONS: Record<ImportType, { label: string; key: string; required?: boolean }[]> = {
    controls: [
        { label: "Control ID", key: "controlCode", required: true },
        { label: "Title", key: "title", required: true },
        { label: "Description", key: "description" },
        { label: "Grouping", key: "grouping" },
        { label: "Owner", key: "owner" },
        { label: "Review date", key: "dueDate" },
    ],
    risks: [
        { label: "Risk title", key: "title", required: true },
        { label: "Description", key: "description" },
        { label: "Likelihood (1-5)", key: "likelihood" },
        { label: "Impact (1-5)", key: "impact" },
        { label: "Status", key: "status" },
        { label: "Owner", key: "owner" },
    ],
    assets: [
        { label: "Asset Name", key: "name", required: true },
        { label: "Type", key: "type", required: true },
        { label: "Owner", key: "owner" },
        { label: "Criticality", key: "criticality" },
    ],
    policies: [
        { label: "Policy Name", key: "name", required: true },
        { label: "Content", key: "content" },
        { label: "Status", key: "status" },
    ],
};

type DraftRow = Record<string, string>;

type RowMessage = { errors: string[]; warnings: string[]; action: string };

const CORE_KINDS: ImportType[] = ["controls", "risks"];

export function SpreadsheetMapper({ clientId, headers, data, onCancel, onSuccess, kinds, embedded }: SpreadsheetMapperProps) {
    const community = communityFromFlag(import.meta.env.VITE_ENABLE_PREMIUM);
    const allowed = (kinds ?? (community ? CORE_KINDS : (Object.keys(FIELD_DEFINITIONS) as ImportType[])))
        .filter((kind) => (community ? CORE_KINDS.includes(kind) : true));
    const [step, setStep] = useState(1);
    const [importType, setImportType] = useState<ImportType | null>(null);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [drafts, setDrafts] = useState<DraftRow[]>([]);
    const [messages, setMessages] = useState<Record<number, RowMessage>>({});
    const [summary, setSummary] = useState<{ create: number; update: number; skipped: number; errors: number; warnings: number } | null>(null);

    const previewMutation = trpc.spreadsheetImport.preview.useMutation();
    const commitMutation = trpc.spreadsheetImport.commit.useMutation();
    const legacyMutation = trpc.backupRestore.importSpreadsheetData.useMutation();

    const currentFields = importType ? FIELD_DEFINITIONS[importType] : [];
    const checkedKind = importType === "controls" || importType === "risks";

    const autoMap = (type: ImportType) => {
        const next: Record<string, string> = {};
        FIELD_DEFINITIONS[type].forEach((field) => {
            const match = headers.find((header) =>
                header.toLowerCase() === field.key.toLowerCase()
                || header.toLowerCase() === field.label.toLowerCase()
                || header.toLowerCase().includes(field.key.toLowerCase())
            );
            if (match) next[field.key] = match;
        });
        setMapping(next);
    };

    const mappedRows = useMemo(() => {
        return data.map((row) => {
            const mapped: DraftRow = {};
            currentFields.forEach((field) => {
                const header = mapping[field.key];
                mapped[field.key] = header && header !== "skip" ? String(row[header] ?? "") : "";
            });
            return mapped;
        });
    }, [data, mapping, currentFields]);

    const isMappingValid = () => currentFields.filter((field) => field.required).every((field) => mapping[field.key] && mapping[field.key] !== "skip");

    const applyPlan = (plan: { summary: typeof summary; rows: { index: number; action: string; errors: string[]; warnings: string[] }[] }) => {
        setSummary(plan.summary);
        const next: Record<number, RowMessage> = {};
        plan.rows.forEach((row) => {
            next[row.index] = { errors: row.errors, warnings: row.warnings, action: row.action };
        });
        setMessages(next);
    };

    const runPreview = async (rows: DraftRow[]) => {
        if (importType !== "controls" && importType !== "risks") return;
        const plan = await previewMutation.mutateAsync({ clientId, kind: importType, rows });
        applyPlan(plan);
    };

    const handleReview = async () => {
        setDrafts(mappedRows);
        setStep(3);
        if (checkedKind) {
            try {
                await runPreview(mappedRows);
            } catch (error: any) {
                toast.error(error?.message || "We could not check these rows.");
            }
        }
    };

    const updateCell = (index: number, key: string, value: string) => {
        setDrafts((current) => current.map((row, offset) => offset === index ? { ...row, [key]: value } : row));
    };

    const handleRecheck = async () => {
        try {
            await runPreview(drafts);
            toast.success("Checked again.");
        } catch (error: any) {
            toast.error(error?.message || "We could not check these rows.");
        }
    };

    const handleImport = async () => {
        if (!importType) return;
        try {
            if (importType === "controls" || importType === "risks") {
                const result = await commitMutation.mutateAsync({ clientId, kind: importType, rows: drafts });
                toast.success(`Saved ${result.saved} rows on this server.`);
            } else {
                await legacyMutation.mutateAsync({ clientId, type: importType, data: drafts });
                toast.success("Import saved.");
            }
            onSuccess();
        } catch (error: any) {
            toast.error(error?.message || "Import failed.");
        }
    };

    const visibleRows = drafts
        .map((row, offset) => ({ index: offset + 1, row }))
        .sort((a, b) => {
            const rank = (index: number) => (messages[index]?.errors.length ? 0 : messages[index]?.warnings.length ? 1 : 2);
            return rank(a.index) - rank(b.index) || a.index - b.index;
        })
        .slice(0, 80);

    return (
        <div className={embedded ? "space-y-4" : "max-w-4xl mx-auto space-y-6"}>
            <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={onCancel} className="gap-2">
                    <ChevronLeft className="h-4 w-4" />
                    Cancel import
                </Button>
                <p className="text-xs text-muted-foreground text-right">Read in your browser. Saved only on this server.</p>
            </div>

            {step === 1 && (
                <div className="space-y-4">
                    <div className="space-y-1">
                        <h2 className="text-xl font-bold">What are you importing?</h2>
                        <p className="text-sm text-muted-foreground">Controls and risks can be checked before anything is saved.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {allowed.map((type) => (
                            <Card key={type} className="cursor-pointer hover:border-primary" onClick={() => { setImportType(type); setStep(2); autoMap(type); }}>
                                <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                                    <TableIcon className="h-5 w-5 text-primary" />
                                    <div>
                                        <CardTitle className="capitalize text-base">{type}</CardTitle>
                                        <CardDescription>Bring your {type} list.</CardDescription>
                                    </div>
                                </CardHeader>
                            </Card>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => downloadSpreadsheetTemplate("controls")}>
                            <Download className="h-4 w-4 mr-2" />
                            Download controls template
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => downloadSpreadsheetTemplate("risks")}>
                            <Download className="h-4 w-4 mr-2" />
                            Download risks template
                        </Button>
                    </div>
                </div>
            )}

            {step === 2 && importType && (
                <Card>
                    <CardHeader>
                        <CardTitle className="capitalize">Map {importType} columns</CardTitle>
                        <CardDescription>Match your spreadsheet columns to the fields we store.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {currentFields.map((field) => (
                            <div key={field.key} className="grid grid-cols-2 gap-3 items-center">
                                <span className="text-sm">{field.label}{field.required ? " *" : ""}</span>
                                <Select value={mapping[field.key] || "skip"} onValueChange={(value) => setMapping((prev) => ({ ...prev, [field.key]: value }))}>
                                    <SelectTrigger><SelectValue placeholder="Skip" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="skip">Skip</SelectItem>
                                        {headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        ))}
                    </CardContent>
                    <CardFooter className="flex justify-between">
                        <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                        <Button onClick={() => void handleReview()} disabled={!isMappingValid()} className="gap-2">
                            Check rows <ArrowRight className="h-4 w-4" />
                        </Button>
                    </CardFooter>
                </Card>
            )}

            {step === 3 && importType && (
                <Card>
                    <CardHeader>
                        <CardTitle>Check before you save</CardTitle>
                        <CardDescription>
                            {summary
                                ? `Would create ${summary.create}, update ${summary.update}, skip ${summary.skipped}. ${summary.errors} with errors, ${summary.warnings} with warnings.`
                                : "Checking the rows on this server."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="border rounded-md overflow-auto max-h-80">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Row</TableHead>
                                        {currentFields.map((field) => <TableHead key={field.key}>{field.label}</TableHead>)}
                                        <TableHead>Check</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {visibleRows.map((entry) => {
                                        const message = messages[entry.index];
                                        const broken = !!message && message.errors.length > 0;
                                        return (
                                            <TableRow key={entry.index}>
                                                <TableCell>{entry.index}</TableCell>
                                                {currentFields.map((field) => (
                                                    <TableCell key={field.key}>
                                                        {broken ? (
                                                            <Input
                                                                aria-label={`${field.label} row ${entry.index}`}
                                                                value={entry.row[field.key] || ""}
                                                                onChange={(event) => updateCell(entry.index - 1, field.key, event.target.value)}
                                                                className="h-8"
                                                            />
                                                        ) : (
                                                            <span className="text-xs">{entry.row[field.key] || "—"}</span>
                                                        )}
                                                    </TableCell>
                                                ))}
                                                <TableCell className="text-xs max-w-[220px]">
                                                    {message?.errors.map((error) => <p key={error} className="text-red-700">{error}</p>)}
                                                    {message?.warnings.map((warning) => <p key={warning} className="text-amber-700">{warning}</p>)}
                                                    {!message?.errors.length && !message?.warnings.length ? <span className="text-muted-foreground">Looks fine</span> : null}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                        {summary && summary.errors > 0 && (
                            <p className="text-sm flex gap-2 text-amber-800">
                                <AlertCircle className="h-4 w-4 mt-0.5" />
                                Fix the cells in red, then check again. Only valid rows are saved.
                            </p>
                        )}
                    </CardContent>
                    <CardFooter className="flex justify-between gap-2">
                        <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                        <div className="flex gap-2">
                            {checkedKind && (
                                <Button variant="outline" onClick={() => void handleRecheck()} disabled={previewMutation.isPending}>
                                    {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check again"}
                                </Button>
                            )}
                            <Button onClick={() => void handleImport()} disabled={commitMutation.isPending || legacyMutation.isPending || (checkedKind && !summary) || (summary != null && summary.create === 0 && summary.update === 0)} className="gap-2">
                                {(commitMutation.isPending || legacyMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                Import valid rows
                            </Button>
                        </div>
                    </CardFooter>
                </Card>
            )}
        </div>
    );
}

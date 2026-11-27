import { useMemo, useState } from "react";
import { Button } from "@complianceos/ui/ui/button";
import { Input } from "@complianceos/ui/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@complianceos/ui/ui/sheet";
import { HelpCircle } from "lucide-react";
import { searchHelp } from "@/lib/help/search";
import { authedFetch } from "@/lib/authedFetch";
import { useAuth } from "@/contexts/AuthContext";

export function HelpDrawer() {
    const { user } = useAuth();
    const [query, setQuery] = useState("");
    const [files, setFiles] = useState<string[] | null>(null);
    const [note, setNote] = useState("");
    const results = useMemo(() => searchHelp(query), [query]);
    const isAdmin = user?.role === "admin" || user?.role === "super_admin" || user?.role === "owner";

    const preview = async () => {
        const response = await authedFetch("/api/admin/diagnostics");
        if (!response.ok) {
            setNote("Only an administrator can download diagnostics.");
            return;
        }
        const body = await response.json();
        setFiles(Array.isArray(body.files) ? body.files : []);
        setNote(typeof body.note === "string" ? body.note : "");
    };

    const download = async () => {
        const response = await authedFetch("/api/admin/diagnostics/download");
        if (!response.ok) {
            setNote("Only an administrator can download diagnostics.");
            return;
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "grcompliance-diagnostics.zip";
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Help" className="h-9 w-9">
                    <HelpCircle className="h-4 w-4" />
                </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Help</SheetTitle>
                    <SheetDescription>Search the guides that ship with this install. Nothing is sent to us.</SheetDescription>
                </SheetHeader>
                <div className="mt-4 space-y-4">
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search help" aria-label="Search help" />
                    <ul className="space-y-3">
                        {results.map((article) => (
                            <li key={article.id} className="rounded-md border p-3">
                                <p className="text-sm font-medium">{article.title}</p>
                                <p className="text-xs text-muted-foreground">{article.screen}</p>
                                <p className="mt-1 text-sm">{article.body}</p>
                            </li>
                        ))}
                    </ul>
                    {isAdmin && (
                        <div className="space-y-2 border-t pt-4">
                            <p className="text-sm font-medium">Download diagnostics</p>
                            <p className="text-xs text-muted-foreground">Version, health, container status, redacted logs, and setting names. No database rows and no secrets. The file stays on your computer.</p>
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => void preview()}>Preview files</Button>
                                <Button type="button" size="sm" onClick={() => void download()} disabled={!files}>Download</Button>
                            </div>
                            {files && <p className="text-xs">{files.join(", ")}</p>}
                            {note && <p className="text-xs text-muted-foreground">{note}</p>}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

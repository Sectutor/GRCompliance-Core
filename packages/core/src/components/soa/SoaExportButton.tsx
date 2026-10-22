import { useState } from "react";
import { Button } from "@complianceos/ui/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@complianceos/ui/ui/dropdown-menu";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authedFetch } from "@/lib/authedFetch";

type SoaFormat = "docx" | "csv";

/**
 * Downloads the Statement of Applicability inside the app.
 * Word is the default the button tooltip describes. CSV is the same route.
 * This stays a Community action: it does not check a premium license.
 */
export function SoaExportButton({ clientId, className }: { clientId: number; className?: string }) {
    const [pending, setPending] = useState(false);

    async function download(format: SoaFormat) {
        if (!clientId) {
            toast.error("Open a workspace before exporting the Statement of Applicability");
            return;
        }
        setPending(true);
        try {
            const response = await authedFetch(`/api/export/soa/${clientId}?format=${format}`);
            if (!response.ok) {
                const message = response.status === 401
                    ? "Sign in again to export the Statement of Applicability"
                    : response.status === 403
                        ? "You do not have access to this workspace"
                        : "Could not export the Statement of Applicability";
                toast.error(message);
                return;
            }
            const blob = await response.blob();
            const disposition = response.headers.get("Content-Disposition") || "";
            const match = /filename="([^"]+)"/.exec(disposition);
            const filename = match?.[1] || `Statement-of-Applicability.${format}`;
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch {
            toast.error("Could not export the Statement of Applicability");
        } finally {
            setPending(false);
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className={className}
                    title="Export SoA to Word"
                    disabled={pending}
                >
                    {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Export SoA
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => download("docx")}>Word (.docx)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => download("csv")}>CSV</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

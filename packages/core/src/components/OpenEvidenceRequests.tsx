import { Button } from "@complianceos/ui/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/** Open evidence requests for a workspace. Shown on Evidence Collection and Audit Preparation. */
export function OpenEvidenceRequests({ clientId }: { clientId: number }) {
    const { data, refetch } = trpc.evidenceRequests.list.useQuery(
        { clientId },
        { enabled: clientId > 0 },
    );
    const updateStatus = trpc.evidenceRequests.updateStatus.useMutation({
        onSuccess: () => {
            toast.success("Request fulfilled");
            refetch();
        },
        onError: (error) => toast.error(error.message),
    });

    const open = (data ?? []).filter((row) => !row.request.status || row.request.status === "open");
    if (open.length === 0) return null;

    return (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-800">Open evidence requests</h2>
                <span className="text-xs text-slate-500">{open.length}</span>
            </div>
            <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto">
                {open.map((row) => {
                    const due = row.request.dueDate ? new Date(row.request.dueDate).toLocaleDateString() : "none";
                    const assignee = row.assignee ? `${row.assignee.name} (${row.assignee.label})` : "Unassigned";
                    return (
                        <li key={row.request.id} className="flex items-start justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-slate-800">
                                    {row.controlCode || "Control"} · {assignee}
                                </div>
                                <div className="truncate text-xs text-slate-500">
                                    {row.request.description || "No instructions"} · Due {due}
                                </div>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={updateStatus.isPending}
                                onClick={() => updateStatus.mutate({ id: row.request.id, status: "fulfilled" })}
                            >
                                Mark fulfilled
                            </Button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

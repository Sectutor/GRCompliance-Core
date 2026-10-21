import React, { useEffect, useState } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Input, Label } from "@complianceos/ui";
import { trpc } from "@/lib/trpc";
import { useClientContext } from "@/contexts/ClientContext";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";

interface MonthlyReadinessPanelProps {
  clientId: number;
}

function decodePdf(pdfBase64: string): Uint8Array {
  const binary = atob(pdfBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function MonthlyReadinessPanel({ clientId }: MonthlyReadinessPanelProps) {
  const utils = trpc.useUtils();
  const { userRole } = useClientContext();
  const canEdit = !userRole || userRole === "owner" || userRole === "admin" || userRole === "editor";
  const settings = trpc.monthlyReadiness.getSettings.useQuery({ clientId });
  const reports = trpc.monthlyReadiness.list.useQuery({ clientId });
  const [enabled, setEnabled] = useState(false);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [truthFilePath, setTruthFilePath] = useState("");

  useEffect(() => {
    if (!settings.data) return;
    setEnabled(settings.data.enabled);
    setDayOfMonth(settings.data.dayOfMonth);
    setTruthFilePath(settings.data.truthFilePath ?? "");
  }, [settings.data]);

  const save = trpc.monthlyReadiness.setSettings.useMutation({
    onSuccess: () => {
      toast.success("Monthly readiness settings saved");
      void utils.monthlyReadiness.getSettings.invalidate({ clientId });
    },
    onError: (error) => toast.error(error.message),
  });

  const generate = trpc.monthlyReadiness.generateNow.useMutation({
    onSuccess: () => {
      toast.success("Draft stored for download. It was not emailed.");
      void utils.monthlyReadiness.list.invalidate({ clientId });
    },
    onError: (error) => toast.error(error.message),
  });

  async function download(reportId: number) {
    try {
      const file = await utils.monthlyReadiness.download.fetch({ clientId, reportId });
      const bytes = decodePdf(file.pdfBase64);
      const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#1C4D8D]">
            <FileText className="h-5 w-5" />
            Monthly readiness report
          </CardTitle>
          <CardDescription>
            A draft PDF is stored in the workspace and can be downloaded here. It is not emailed.
            The schedule stays off until this workspace opts in. The server runs it only when
            ENABLE_MONTHLY_READINESS_SCHEDULER is true. The day of the month is 1–28 so February is included.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="monthly-readiness-enabled"
              checked={enabled}
              disabled={!canEdit}
              onCheckedChange={(checked) => setEnabled(checked === true)}
            />
            <Label htmlFor="monthly-readiness-enabled">Opt in to the monthly schedule for this workspace</Label>
          </div>
          <div className="grid gap-2 max-w-xs">
            <Label htmlFor="monthly-readiness-day">Day of month (UTC, 1–28)</Label>
            <Input
              id="monthly-readiness-day"
              type="number"
              min={1}
              max={28}
              value={dayOfMonth}
              disabled={!canEdit}
              onChange={(event) => setDayOfMonth(Number(event.target.value))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="monthly-readiness-truth">Truth file inside truth-files/ (optional)</Label>
            <Input
              id="monthly-readiness-truth"
              placeholder="latore-ltd.yaml"
              value={truthFilePath}
              disabled={!canEdit}
              onChange={(event) => setTruthFilePath(event.target.value)}
            />
            <p className="text-sm text-slate-500">
              Leave this blank to use truth-files/&lt;workspace-name&gt;.yaml when that file exists.
              A path outside that folder is rejected.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              className="bg-[#1C4D8D] text-white hover:bg-[#3ABEF9]"
              disabled={!canEdit || save.isPending}
              onClick={() => save.mutate({
                clientId,
                enabled,
                dayOfMonth,
                truthFilePath: truthFilePath.trim() || null,
              })}
            >
              Save settings
            </Button>
            <Button
              variant="outline"
              disabled={!canEdit || generate.isPending}
              onClick={() => generate.mutate({ clientId })}
            >
              Generate draft now
            </Button>
          </div>
          {!canEdit && (
            <p className="text-sm text-slate-500">This workspace role can download drafts. Saving and generating need an editor.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-[#1C4D8D]">Stored drafts</CardTitle>
          <CardDescription>Each file stays a draft until Emmanuel signs it. Nothing here is sent to the client.</CardDescription>
        </CardHeader>
        <CardContent>
          {reports.data && reports.data.length === 0 && (
            <p className="text-sm text-slate-500">No monthly readiness report is stored for this workspace.</p>
          )}
          <ul className="space-y-3">
            {reports.data?.map((report) => (
              <li key={report.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium text-slate-900">{report.filename}</div>
                  <div className="text-sm text-slate-500">
                    {report.periodStart} to {report.periodEnd} · {report.status} · {new Date(report.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC
                  </div>
                </div>
                <Button variant="outline" onClick={() => void download(report.id)}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

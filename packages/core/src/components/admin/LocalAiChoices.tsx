import { useState } from "react";
import { Button } from "@complianceos/ui/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@complianceos/ui/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function LocalAiChoices({ onBringKey }: { onBringKey: () => void }) {
    const [choice, setChoice] = useState<"builtin" | "key" | "later" | null>(null);
    const offer = trpc.llm.localOffer.useQuery();
    const prepare = trpc.llm.prepareLocal.useMutation({
        onSuccess: (result: { ok?: boolean; message?: string }) => {
            const message = result?.message || "We could not prepare the model.";
            if (result?.ok) toast.success(message);
            else toast.error(message);
        },
        onError: () => toast.error("We could not prepare the model. The download stays on this server when it works."),
    });
    const info = offer.data;

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base">How should AI run?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <p>Pick one. You can change this later. Nothing is downloaded until you ask.</p>
                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant={choice === "builtin" ? "default" : "outline"} onClick={() => setChoice("builtin")}>
                        Use built-in private AI
                    </Button>
                    <Button type="button" variant={choice === "key" ? "default" : "outline"} onClick={() => { setChoice("key"); onBringKey(); }}>
                        Bring your own key
                    </Button>
                    <Button type="button" variant={choice === "later" ? "default" : "outline"} onClick={() => setChoice("later")}>
                        Not now
                    </Button>
                </div>
                {choice === "builtin" && (
                    <div className="space-y-2 rounded-md border p-3">
                        <p>About {info?.downloadMb ?? 400} MB. Needs about {info?.ramGb ?? 4} GB of memory. This server has about {info?.freeRamGb ?? "…"} GB free. Answers from a small model are shorter than a large one. The model runs on this server.</p>
                        <p className="text-muted-foreground">{info?.note}</p>
                        {!info?.configured && <p>On the server: <code>{info?.command || "docker compose --profile ai up -d ollama"}</code></p>}
                        <Button type="button" size="sm" onClick={() => prepare.mutate()} disabled={prepare.isPending}>
                            {prepare.isPending ? "Downloading…" : "Download the small model"}
                        </Button>
                    </div>
                )}
                {choice === "later" && <p>AI stays off until you add a key or the built-in model.</p>}
            </CardContent>
        </Card>
    );
}

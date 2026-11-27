import { useEffect, useState } from "react";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@complianceos/ui/ui/dialog";
import { Button } from "@complianceos/ui/ui/button";
import { Input } from "@complianceos/ui/ui/input";
import { Label } from "@complianceos/ui/ui/label";
import { Card, CardContent } from "@complianceos/ui/ui/card";
import { Checkbox } from "@complianceos/ui/ui/checkbox";
import { Badge } from "@complianceos/ui/ui/badge";
import { Shield, Sparkles, ArrowRight, Loader2, CheckCircle2, Rocket, Wand2, Copy } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { SpreadsheetDropzone } from "@/components/settings/SpreadsheetDropzone";

const STORAGE_KEY = "grc.firstRun.v1";

type SavedRun = {
    step: number;
    clientId: number | null;
    name: string;
    industry: string;
    frameworks: string[];
    completed: boolean;
};

function readSaved(): SavedRun | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as SavedRun;
        if (!parsed || typeof parsed.step !== "number") return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeSaved(value: SavedRun) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function OnboardingWizard() {
    const { user } = useAuth();
    const { data: clients, isLoading: clientsLoading } = trpc.clients.list.useQuery();
    const { data: allFrameworks, isLoading: frameworksLoading } = trpc.frameworks.getOnboardingFrameworks.useQuery();
    const saved = readSaved();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(saved?.step && saved.step >= 1 && saved.step <= 5 ? saved.step : 1);
    const [, setLocation] = useLocation();
    const utils = trpc.useUtils();
    const [clientId, setClientId] = useState<number | null>(saved?.clientId ?? null);
    const [inviteUrl, setInviteUrl] = useState("");
    const [inviteEmail, setInviteEmail] = useState("");
    const [formData, setFormData] = useState({
        name: saved?.name || "",
        industry: saved?.industry || "Technology",
        frameworks: saved?.frameworks || [] as string[],
    });

    const demo = import.meta.env.VITE_APP_MODE === "demo";

    const setupMutation = trpc.clients.autoSetup.useMutation();
    const inviteMutation = trpc.workspaceInvites.createLink.useMutation();

    useEffect(() => {
        if (demo || clientsLoading || !user) return;
        const current = readSaved();
        if (current?.completed) return;
        if (current && (current.clientId || current.step > 1 || current.name)) {
            setOpen(true);
            return;
        }
        if (clients && clients.length === 0) setOpen(true);
    }, [clients, clientsLoading, demo, user]);

    useEffect(() => {
        if (!open) return;
        writeSaved({
            step,
            clientId,
            name: formData.name,
            industry: formData.industry,
            frameworks: formData.frameworks,
            completed: false,
        });
    }, [open, step, clientId, formData]);

    const handleFrameworkToggle = (fw: string) => {
        setFormData((prev) => ({
            ...prev,
            frameworks: prev.frameworks.includes(fw)
                ? prev.frameworks.filter((item) => item !== fw)
                : [...prev.frameworks, fw],
        }));
    };

    const handleNext = async () => {
        if (step === 1 && !formData.name.trim()) {
            toast.error("Enter your company name.");
            return;
        }
        if (!clientId && step >= 2) {
            try {
                const client = await setupMutation.mutateAsync({
                    name: formData.name.trim(),
                    industry: formData.industry,
                    frameworks: formData.frameworks,
                    generatePolicies: true,
                    includeSampleData: false,
                });
                setClientId(client.id);
                await utils.clients.list.invalidate();
                setStep(3);
            } catch (error: any) {
                toast.error(error?.message || "We could not create the workspace.");
            }
            return;
        }
        setStep((current) => Math.min(5, current + 1));
    };

    const handleBack = () => setStep((current) => Math.max(1, current - 1));

    const createInvite = async () => {
        if (!clientId) return;
        try {
            const result = await inviteMutation.mutateAsync({
                clientId,
                email: inviteEmail,
                role: "viewer",
            });
            setInviteUrl(result.url);
            toast.success("Invite link ready. It expires in 7 days and works once.");
        } catch (error: any) {
            toast.error(error?.message || "We could not create the invite link.");
        }
    };

    const finish = () => {
        writeSaved({
            step: 5,
            clientId,
            name: formData.name,
            industry: formData.industry,
            frameworks: formData.frameworks,
            completed: true,
        });
        setOpen(false);
        if (clientId) setLocation(`/clients/${clientId}`);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className={`p-0 overflow-hidden border-none shadow-2xl bg-white ${step >= 3 ? "sm:max-w-[760px]" : "sm:max-w-[520px]"}`}>
                <DialogHeader className="sr-only">
                    <DialogTitle>Welcome to GRCompliance</DialogTitle>
                    <DialogDescription>Set up your workspace on this server.</DialogDescription>
                </DialogHeader>
                <div className="bg-gradient-to-br from-blue-600 via-primary to-indigo-800 p-6 text-white relative">
                    <Wand2 className="absolute top-4 right-4 h-20 w-20 text-white/10 rotate-12" />
                    <div className="relative z-10">
                        <Badge variant="secondary" className="bg-white/20 text-white border-none mb-3">
                            <Sparkles className="h-3 w-3 mr-1" />
                            Step {step} of 5
                        </Badge>
                        <h2 className="text-2xl font-bold tracking-tight">Welcome to GRCompliance</h2>
                        <p className="text-white/80 mt-1 text-sm">We will set this up on your server. Nothing is sent to us.</p>
                    </div>
                </div>

                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    {step === 1 && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Company name</Label>
                                <Input id="name" value={formData.name} onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="industry">Industry</Label>
                                <select
                                    id="industry"
                                    className="flex h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 text-sm"
                                    value={formData.industry}
                                    onChange={(event) => setFormData((prev) => ({ ...prev, industry: event.target.value }))}
                                >
                                    {["Technology", "Healthcare", "Finance", "Retail", "Manufacturing", "Education", "Government", "Other"].map((industry) => (
                                        <option key={industry} value={industry}>{industry}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-3">
                            <Label>Which standards are you working towards?</Label>
                            <div className="grid gap-2 max-h-[280px] overflow-y-auto">
                                {frameworksLoading ? <p className="text-sm text-muted-foreground">Loading standards…</p> : allFrameworks?.map((fw: any) => (
                                    <Card key={fw.id} className={`cursor-pointer border-2 ${formData.frameworks.includes(fw.shortCode) ? "border-primary" : "border-slate-100"}`} onClick={() => handleFrameworkToggle(fw.shortCode)}>
                                        <CardContent className="p-3 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Shield className="h-4 w-4" />
                                                <span className="font-medium text-sm">{fw.name}</span>
                                            </div>
                                            <Checkbox checked={formData.frameworks.includes(fw.shortCode)} />
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 3 && clientId && (
                        <div className="space-y-3">
                            <h3 className="font-semibold">Bring your spreadsheet</h3>
                            <SpreadsheetDropzone clientId={clientId} onDone={() => setStep(4)} />
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-3">
                            <h3 className="font-semibold">Invite someone</h3>
                            <p className="text-sm text-muted-foreground">
                                Email is not sent from here. We make a one-time link you can copy. It expires in 7 days.
                            </p>
                            <Label htmlFor="invite-email">Email address</Label>
                            <Input id="invite-email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="colleague@example.com" />
                            <Button type="button" onClick={() => void createInvite()} disabled={inviteMutation.isPending || !inviteEmail}>
                                {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create invite link"}
                            </Button>
                            {inviteUrl && (
                                <div className="flex gap-2">
                                    <Input readOnly value={inviteUrl} aria-label="Invite link" />
                                    <Button type="button" variant="outline" onClick={() => { void navigator.clipboard.writeText(inviteUrl); toast.success("Copied."); }}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 5 && (
                        <div className="text-center space-y-3 py-4">
                            <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
                            <h3 className="text-xl font-bold">You are set up</h3>
                            <p className="text-sm text-muted-foreground">The next list on your workspace shows what to do from here.</p>
                        </div>
                    )}
                </div>

                <DialogFooter className="p-6 bg-slate-50 border-t flex flex-row items-center justify-between">
                    {step > 1 && step < 5 ? (
                        <Button variant="ghost" onClick={handleBack} disabled={setupMutation.isPending}>Back</Button>
                    ) : <div />}
                    {step < 5 ? (
                        <Button onClick={() => void handleNext()} disabled={setupMutation.isPending}>
                            {setupMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            {step === 3 ? "Continue" : "Next"}
                            <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    ) : (
                        <Button onClick={finish}>
                            See what to do next
                            <Rocket className="h-4 w-4 ml-2" />
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

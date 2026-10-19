import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@complianceos/ui/ui/card";
import { Button } from "@complianceos/ui/ui/button";
import { Progress } from "@complianceos/ui/ui/progress";
import { Badge } from "@complianceos/ui/ui/badge";
import { useLocation, useParams } from "wouter";
import {
    Shield,
    FileText,
    CheckCircle2,
    ArrowRight,
    Calendar,
    Lock
} from "lucide-react";

import { ISOLayout } from "./ISOLayout";
import { PageGuide } from "@/components/PageGuide";
import { trpc } from "@/lib/trpc";
import { postureScoreFromStatuses } from "@/lib/postureScore";

export default function ISODashboard() {
    const { id } = useParams<{ id: string }>();
    const clientId = parseInt(id || "0");
    const [, setLocation] = useLocation();

    const { data: controlRows } = trpc.clientControls.list.useQuery(
        { clientId, framework: "ISO 27001" },
        { enabled: clientId > 0 }
    );
    const { data: riskRows } = trpc.risks.getRiskAssessments.useQuery(
        { clientId },
        { enabled: clientId > 0 }
    );

    const posture = postureScoreFromStatuses(
        (controlRows || []).map((row: any) => row.clientControl?.status || row.status)
    );
    const applicable = { length: posture.inScope };
    const implemented = posture.implemented;
    const readiness = posture.rate;
    const risks = riskRows || [];
    const treated = risks.filter((risk: any) => risk.treatmentOption && risk.treatmentOption !== "None").length;
    const riskProgress = risks.length > 0 ? Math.round((treated / risks.length) * 100) : null;

    const modules = [
        {
            title: "Statement of Applicability",
            description: "Define your ISMS scope and Annex A control usage.",
            icon: CheckCircle2,
            path: `/clients/${clientId}/iso27001/soa`,
            progress: readiness,
            status: applicable.length === 0 ? "No data" : implemented === applicable.length ? "Complete" : "In progress"
        },
        {
            title: "Risk Management",
            description: "ISO 27005 aligned risk assessment and treatment.",
            icon: Shield,
            path: `/clients/${clientId}/iso27001/risks`,
            progress: riskProgress,
            status: risks.length === 0 ? "No data" : "In progress"
        },
        {
            title: "Asset Register",
            description: "Classify and manage information assets and owners.",
            icon: Lock,
            path: `/clients/${clientId}/iso27001/assets`,
            progress: null,
            status: "Open"
        },
        {
            title: "Internal Audit",
            description: "Plan and track ISO internal audit cycles.",
            icon: FileText,
            path: `/clients/${clientId}/audit-manager`,
            progress: null,
            status: "Open"
        }
    ];

    return (
        <ISOLayout clientId={clientId}>
            <div className="p-8 space-y-8 animate-in fade-in duration-500">
                <div className="relative overflow-hidden rounded-3xl bg-slate-900 p-8 md:p-12 text-white shadow-2xl">
                    <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />

                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                        <div className="space-y-4">
                            <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 px-3 py-1">ISO 27001:2022 ISMS</Badge>
                            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
                                Security Management <br />
                                <span className="text-indigo-400">Command Center</span>
                            </h1>
                            <p className="text-slate-400 text-lg max-w-xl">
                                Counts on this page come from the controls and risks recorded for this workspace.
                            </p>
                        </div>
                        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-2xl w-full md:w-80">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-sm font-medium text-slate-300">Control readiness</span>
                                <span className="text-2xl font-bold text-indigo-400">{readiness === null ? "—" : `${readiness}%`}</span>
                            </div>
                            <Progress value={readiness ?? 0} className="h-2 bg-white/10" />
                            <div className="mt-4 flex gap-2">
                                <div className="flex-1 bg-white/5 rounded-lg p-3 text-center border border-white/5">
                                    <p className="text-[10px] text-slate-500 uppercase">Controls</p>
                                    <p className="font-bold text-emerald-400 text-lg">{applicable.length === 0 ? "—" : `${implemented}/${applicable.length}`}</p>
                                </div>
                                <div className="flex-1 bg-white/5 rounded-lg p-3 text-center border border-white/5">
                                    <p className="text-[10px] text-slate-500 uppercase">Risks</p>
                                    <p className="font-bold text-amber-400 text-lg">{risks.length}</p>
                                </div>
                            </div>
                            <div className="mt-3 flex justify-end">
                                <PageGuide
                                    title="ISO 27001:2022 ISMS"
                                    description="Manage your Information Security Management System across the controls assigned to this workspace."
                                    rationale="ISO 27001 certification demonstrates a systematic approach to managing sensitive information."
                                    howToUse={[
                                        { step: "Statement of Applicability", description: "Start by defining which controls apply to your ISMS scope.", targetId: "iso-statement-of-applicability-card" },
                                        { step: "Risk Management", description: "Identify and treat information security risks aligned to ISO 27005.", targetId: "iso-risk-management-card" },
                                        { step: "Asset Register", description: "Classify information assets and assign owners.", targetId: "iso-asset-register-card" },
                                        { step: "Internal Audit", description: "Schedule internal audits against the assigned controls.", targetId: "iso-internal-audit-card" }
                                    ]}
                                    scenarios={[]}
                                    integrations={[]}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div id="iso-modules-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {modules.map((module) => (
                        <Card id={`iso-${module.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-card`} key={module.title} className="group hover:border-indigo-300 transition-all duration-300 shadow-sm hover:shadow-md border-slate-200">
                            <CardHeader className="space-y-1">
                                <div className="flex justify-between items-center mb-2">
                                    <div className="p-2 bg-slate-50 rounded-lg text-slate-600 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-colors">
                                        <module.icon className="h-5 w-5" />
                                    </div>
                                    <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider">{module.status}</Badge>
                                </div>
                                <CardTitle className="text-lg font-bold group-hover:text-indigo-600 transition-colors">{module.title}</CardTitle>
                                <CardDescription className="text-xs">{module.description}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400 tracking-widest">
                                        <span>Progress</span>
                                        <span>{module.progress === null ? "—" : `${module.progress}%`}</span>
                                    </div>
                                    <Progress value={module.progress ?? 0} className="h-1" />
                                </div>
                                <Button
                                    variant="ghost"
                                    className="w-full justify-between text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 p-2 h-auto text-sm font-bold group-hover:translate-x-1 transition-transform"
                                    onClick={() => setLocation(module.path)}
                                >
                                    Open Module <ArrowRight className="h-4 w-4" />
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <Card className="lg:col-span-2 border-slate-200 shadow-sm">
                        <CardHeader className="border-b border-slate-50 pb-4 mb-4">
                            <CardTitle className="text-xl">Compliance timeline</CardTitle>
                            <CardDescription>Activity appears here when this workspace records it.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-slate-500">No activity has been recorded for this workspace yet.</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-indigo-600 text-white shadow-xl shadow-indigo-100 overflow-hidden relative">
                        <CardHeader>
                            <CardTitle className="text-white">Certification readiness</CardTitle>
                            <CardDescription className="text-indigo-100">No certification date is scheduled.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="p-4 bg-white/10 rounded-2xl border border-white/20">
                                <h3 className="font-bold mb-3 flex items-center gap-2">
                                    <Calendar className="h-4 w-4" /> Next steps
                                </h3>
                                <ul className="space-y-2 text-xs text-indigo-50">
                                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-white rounded-full" /> Complete the statement of applicability</li>
                                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-white rounded-full" /> Treat open risks</li>
                                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-white rounded-full" /> Record an internal audit</li>
                                </ul>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </ISOLayout>
    );
}

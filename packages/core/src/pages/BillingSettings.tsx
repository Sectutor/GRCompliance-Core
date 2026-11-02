import { useBilling } from "../hooks/useBilling";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@complianceos/ui/ui/card";
import { Check } from "lucide-react";
import { PREMIUM_CAPABILITIES } from "@/lib/upgradeCopy";
import type { Client } from "@/schema";

export default function BillingSettings({ client }: { client: Client }) {
    const { billingEnabled } = useBilling();

    if (!billingEnabled) {
        return (
            <div className="p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Subscription Management</CardTitle>
                        <CardDescription>Billing is currently disabled for this instance.</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    if (!client) return <div>Loading...</div>;

    return (
        <div className="space-y-6 max-w-3xl mx-auto p-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Premium</h2>
                <p className="text-muted-foreground">Premium is the self-hosted paid edition.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Premium (self-hosted)</CardTitle>
                    <CardDescription>Included with the paid edition. No organization-count tiers.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                    {PREMIUM_CAPABILITIES.map((item) => (
                        <FeatureItem key={item} text={item} checked />
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

function FeatureItem({ text, checked = false }: { text: string, checked?: boolean }) {
    return (
        <div className="flex items-center gap-2 text-sm">
            <div className={`flex items-center justify-center h-5 w-5 rounded-full ${checked ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                <Check className="h-3 w-3" />
            </div>
            <span className={checked ? "font-medium" : "text-muted-foreground"}>{text}</span>
        </div>
    );
}

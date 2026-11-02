import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@complianceos/ui/ui/card";
import { useBilling } from '@/hooks/useBilling';
import { PREMIUM_AVAILABLE } from '@/lib/licenseLabel';
import { PREMIUM_CAPABILITIES } from '@/lib/upgradeCopy';

interface BillingSettingsProps {
    clientId: number;
}

/**
 * Legacy billing panel. Core does not list prices or sell a hosted tier.
 * The workspace settings page uses `pages/BillingSettings.tsx`.
 */
export function BillingSettings({ clientId: _clientId }: BillingSettingsProps) {
    const { billingEnabled } = useBilling();

    if (!billingEnabled) return null;

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Premium</h3>
                <p className="text-sm text-muted-foreground">{PREMIUM_AVAILABLE}</p>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Premium (self-hosted)</CardTitle>
                    <CardDescription>{PREMIUM_AVAILABLE}</CardDescription>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-2 text-sm">
                        {PREMIUM_CAPABILITIES.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}

import { Card, CardContent, CardHeader, CardTitle } from "@complianceos/ui/ui/card";
import { Button } from "@complianceos/ui/ui/button";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { ListChecks } from "lucide-react";

export function NextStepsCard({ clientId }: { clientId: number }) {
    const query = trpc.nextSteps.list.useQuery({ clientId }, { enabled: clientId > 0 });
    if (!query.data) return null;
    const { done, total, items } = query.data;

    return (
        <Card data-testid="next-steps">
            <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                    <ListChecks className="h-4 w-4" />
                    What to do next
                </CardTitle>
                <p className="text-sm text-muted-foreground">{done} of {total} done</p>
            </CardHeader>
            <CardContent className="space-y-3">
                {items.length === 0 ? (
                    <p className="text-sm">You are set for these four checks. Open a module when you want to go further.</p>
                ) : items.map((item) => (
                    <div key={item.rule} className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-sm font-medium">{item.title}</p>
                            <p className="text-xs text-muted-foreground">{item.detail}</p>
                        </div>
                        <Button asChild variant="outline" size="sm">
                            <Link href={item.href}>Open</Link>
                        </Button>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

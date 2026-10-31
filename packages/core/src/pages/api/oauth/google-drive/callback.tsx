/**
 * Google Drive OAuth callback.
 * Exchanges the code for a token so a person can later import one chosen file.
 */

import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useClientContext } from "@/contexts/ClientContext";

export default function GoogleDriveOAuthCallback() {
    const [, setLocation] = useLocation();
    const { selectedClientId } = useClientContext();
    const hasExchanged = useRef(false);

    const exchangeMutation = trpc.integrations.handleOAuthCallback.useMutation({
        onSuccess: () => {
            toast.success("Google Drive connected. Choose a file when you add evidence.");
            setLocation("/settings/integrations?connected=true");
        },
        onError: (err) => {
            toast.error(`Failed to connect Google Drive: ${err.message}`);
            setLocation("/settings/integrations?error=true");
        }
    });

    useEffect(() => {
        if (hasExchanged.current) return;

        const clientId = selectedClientId || Number(sessionStorage.getItem("last_client_id") || "0");
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get("code");
        const error = searchParams.get("error");
        const returnedState = searchParams.get("state");

        if (!clientId) {
            toast.error("Select a workspace before connecting Google Drive.");
            setLocation("/settings/integrations");
            return;
        }

        if (error) {
            toast.error(`Google Drive error: ${error}`);
            setLocation("/settings/integrations?error=oauth_error");
            return;
        }

        if (!code) {
            setLocation("/settings/integrations?error=missing_code");
            return;
        }

        const exchangeKey = `google-drive-oauth-${code}`;
        if (sessionStorage.getItem(exchangeKey) === "started") return;

        const storedState = sessionStorage.getItem("google-drive_oauth_state");
        if (!storedState || !returnedState || storedState !== returnedState) {
            toast.error("OAuth security validation failed. Please try again.");
            setLocation("/settings/integrations?error=csrf_failed");
            return;
        }

        hasExchanged.current = true;
        sessionStorage.setItem(exchangeKey, "started");
        sessionStorage.removeItem("google-drive_oauth_state");
        exchangeMutation.mutate({
            provider: "google-drive",
            code,
            clientId
        });
    }, [setLocation, exchangeMutation, selectedClientId]);

    return (
        <DashboardLayout>
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center space-y-4 bg-white/50 backdrop-blur-xl p-12 rounded-[3rem] border border-slate-200 shadow-2xl">
                    <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto" />
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Connecting Google Drive</h2>
                    <p className="text-slate-500 font-medium">
                        Finishing sign-in so you can import a file you choose.
                    </p>
                </div>
            </div>
        </DashboardLayout>
    );
}

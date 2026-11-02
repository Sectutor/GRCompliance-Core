import { forwardRef, type ComponentProps } from "react";
import RichTextEditor, { RichTextEditorRef } from "@/components/RichTextEditor";
import PolicyLinter from "@/components/policy/PolicyLinter";
import { usePolicyRefineAllowed } from "@/lib/policyRefineAccess";

type LinterProps = Omit<ComponentProps<typeof PolicyLinter>, "allowAiFix" | "content">;

/**
 * Policy editor rewrite controls. Shown only when `clientPolicies.refineAllowed`
 * succeeds, which is the same `checkPremiumAccess` gate as `clientPolicies.refine`.
 */
export const PolicyRefineChrome = forwardRef<RichTextEditorRef, {
    clientId: number;
    content: string;
    onChange: (html: string) => void;
    onAiRewrite: () => void;
    onAiFix: () => void;
    onComment?: (selection: { quote: string; index: number; length: number }) => void;
    onCheckCompliance?: () => void;
    linter: LinterProps;
}>(({ clientId, content, onChange, onAiRewrite, onAiFix, onComment, onCheckCompliance, linter }, ref) => {
    const allowed = usePolicyRefineAllowed(clientId);
    return (
        <>
            <RichTextEditor
                ref={ref}
                value={content}
                onChange={onChange}
                className="min-h-[400px]"
                onAiRewrite={allowed ? onAiRewrite : undefined}
                onAiFix={allowed ? onAiFix : undefined}
                onComment={onComment}
                onCheckCompliance={onCheckCompliance}
            />
            <div id="policy-linter-section">
                <PolicyLinter content={content} {...linter} allowAiFix={allowed} />
            </div>
        </>
    );
});

PolicyRefineChrome.displayName = "PolicyRefineChrome";

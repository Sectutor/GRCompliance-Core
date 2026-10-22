import { Sparkles, Wand2 } from "lucide-react";
import { Button } from "@complianceos/ui/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@complianceos/ui/ui/tooltip";
import {
    COMMUNITY_AI_REWRITE_NOTE,
    aiRewriteOffered,
} from "@/lib/policy/communityAiRewrite";

function premiumFlagOrBuild(
    premiumFlag: string | boolean | null | undefined,
): string | boolean | null | undefined {
    return premiumFlag === undefined ? import.meta.env.VITE_ENABLE_PREMIUM : premiumFlag;
}

/**
 * Plain-language stand-in for AI rewrite controls in the Community build.
 * Renders nothing when rewrite is offered, so Premium layouts stay unchanged.
 */
export function CommunityAiRewriteNote({
    premiumFlag,
    className = "text-xs text-muted-foreground px-2 py-1",
    id,
}: {
    premiumFlag?: string | boolean | null;
    className?: string;
    id?: string;
}) {
    if (aiRewriteOffered(premiumFlagOrBuild(premiumFlag))) return null;
    return (
        <p id={id} className={className} data-testid="community-ai-rewrite-note">
            {COMMUNITY_AI_REWRITE_NOTE}
        </p>
    );
}

/**
 * Toolbar Rewrite / Fix controls. Community builds get the Premium note
 * instead of buttons that call the rewrite API.
 */
export function AiRewriteToolbarActions({
    onRewrite,
    onFix,
    premiumFlag,
}: {
    onRewrite?: () => void;
    onFix?: () => void;
    premiumFlag?: string | boolean | null;
}) {
    if (!aiRewriteOffered(premiumFlagOrBuild(premiumFlag))) {
        return (
            <CommunityAiRewriteNote
                premiumFlag={false}
                id="community-ai-rewrite-note"
                className="text-xs text-muted-foreground px-2 py-1 shrink-0"
            />
        );
    }

    return (
        <>
            {onRewrite && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            id="rte-ai-rewrite"
                            variant="outline"
                            size="sm"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={onRewrite}
                            className="text-purple-600 border-purple-200 hover:bg-purple-50 flex-shrink-0"
                        >
                            <Wand2 className="sm:mr-2 h-4 w-4" />
                            <span className="hidden sm:inline">Rewrite with AI</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Rephrase and improve clarity while maintaining meaning</p>
                    </TooltipContent>
                </Tooltip>
            )}
            {onFix && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            id="rte-ai-fix"
                            variant="outline"
                            size="sm"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={onFix}
                            className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 flex-shrink-0"
                        >
                            <Sparkles className="sm:mr-2 h-4 w-4" />
                            <span className="hidden sm:inline">Fix with AI</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Fix missing sections and resolve placeholders</p>
                    </TooltipContent>
                </Tooltip>
            )}
        </>
    );
}

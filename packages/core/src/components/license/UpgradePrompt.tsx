/**
 * Upgrade Prompt Components
 * 
 * Various ways to prompt users to upgrade from Community to Premium.
 */

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@complianceos/ui';
import { Button } from '@complianceos/ui';
import {
  Zap,
  Users,
  Shield,
  BarChart,
  Cloud,
  Lock,
  ArrowRight,
  Crown,
} from 'lucide-react';
import { useLicense } from '@/lib/license/index';
import { COMMUNITY_WORKSPACE_LIMIT_MESSAGE, isCommunityWorkspaceLimitMessage } from '@/lib/edition';
import { PREMIUM_AVAILABLE, PREMIUM_PRICING_PATH } from '@/lib/licenseLabel';

export const COMMUNITY_WORKSPACE_LIMIT_EVENT = "grc-community-workspace-limit";

interface UpgradePromptProps {
  trigger?: React.ReactNode;
  featureId?: string;
  featureName?: string;
  featureDescription?: string;
  size?: 'sm' | 'md' | 'lg';
  /** When set, the dialog is controlled by the caller (used for server FORBIDDEN responses). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Main upgrade prompt modal
 */
export const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  trigger,
  featureId = 'premium.feature',
  featureName = 'Premium Feature',
  featureDescription = 'This feature is part of Premium',
  size = 'md',
  open: openProp,
  onOpenChange,
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const getFeatureIcon = () => {
    if (featureId.includes('ai.')) return <Zap className="w-6 h-6" />;
    if (featureId.includes('advisor.')) return <Users className="w-6 h-6" />;
    if (featureId.includes('enterprise.')) return <BarChart className="w-6 h-6" />;
    if (featureId.includes('security.')) return <Shield className="w-6 h-6" />;
    if (featureId.includes('reporting.')) return <BarChart className="w-6 h-6" />;
    if (featureId.includes('integration.')) return <Cloud className="w-6 h-6" />;
    return <Lock className="w-6 h-6" />;
  };

  const getDialogSize = () => {
    switch (size) {
      case 'sm': return 'max-w-md';
      case 'lg': return 'max-w-2xl';
      default: return 'max-w-lg';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent className={`${getDialogSize()} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              {getFeatureIcon()}
            </div>
            <div>
              <DialogTitle className="flex items-center gap-2">
                {featureName}
              </DialogTitle>
              <DialogDescription>
                {featureDescription}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <p className="text-sm">{PREMIUM_AVAILABLE}</p>

        <DialogFooter className="flex flex-col sm:flex-row gap-3">
          <Button className="sm:flex-1" asChild>
            <a href={PREMIUM_PRICING_PATH} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
              {PREMIUM_AVAILABLE}
              <ArrowRight className="w-4 h-4 ml-2" />
            </a>
          </Button>

          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
          >
            Maybe Later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog >
  );
};

/**
 * Inline upgrade prompt (small banner)
 */
export const InlineUpgradePrompt: React.FC<{
  featureName?: string;
  compact?: boolean;
}> = ({ featureName = 'this feature', compact = false }) => {
  const { isCommunityEdition } = useLicense();

  if (!isCommunityEdition()) return null;

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-800 px-2 py-1 rounded">
        <Lock className="w-3 h-3" />
        <span>{PREMIUM_AVAILABLE}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-50 to-amber-100 border border-amber-200 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-amber-100 rounded-lg">
          <Crown className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h4 className="font-medium text-amber-900">{PREMIUM_AVAILABLE}</h4>
          <p className="text-sm text-amber-700">
            {PREMIUM_AVAILABLE}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="border-amber-300 text-amber-700 hover:bg-amber-100"
        asChild
      >
        <a href={PREMIUM_PRICING_PATH} target="_blank" rel="noreferrer">
          {PREMIUM_AVAILABLE}
        </a>
      </Button>
    </div>
  );
};

/**
 * Floating upgrade button (for persistent prompts)
 */
export const FloatingUpgradeButton: React.FC = () => {
  const { isCommunityEdition } = useLicense();

  if (!isCommunityEdition()) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <UpgradePrompt
        trigger={
          <Button className="rounded-full shadow-lg h-12 w-12 p-0">
            <Crown className="w-5 h-5" />
          </Button>
        }
        size="lg"
      />
    </div>
  );
};

/**
 * Feature teaser component (shows feature but requires upgrade to use)
 */
export const FeatureTeaser: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  actionText?: string;
}> = ({ title, description, icon, actionText = 'Upgrade to Use' }) => {
  return (
    <div className="relative group">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg blur-sm group-hover:blur-md transition-all duration-300" />
      <div className="relative bg-background border border-primary/20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            {icon}
          </div>
          <div className="flex-1">
            <h4 className="font-medium">{title}</h4>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
          <UpgradePrompt
            trigger={
              <Button size="sm" variant="outline">
                {actionText}
              </Button>
            }
            featureName={title}
            featureDescription={description}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * Usage: Example of how to use these components
 * 
 * 1. For a button that requires upgrade:
 *    <UpgradePrompt
 *      trigger={<Button>Analyze with AI</Button>}
 *      featureId="ai.evidence_analysis"
 *      featureName="AI Evidence Analysis"
 *    />
 * 
 * 2. For inline upgrade notice:
 *    <InlineUpgradePrompt featureName="AI analysis" />
 * 
 * 3. For feature teaser:
 *    <FeatureTeaser
 *      title="AI Risk Triage"
 *      description="Automatically triage risks with AI"
 *      icon={<Zap className="w-6 h-6" />}
 *    />
 */

/**
 * Opens the existing upgrade dialog when a query or mutation reports the
 * Community workspace cap. Mounted once at the app root so a FORBIDDEN
 * response shows this prompt instead of an unhandled error.
 */
export function CommunityWorkspaceLimitHost() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(COMMUNITY_WORKSPACE_LIMIT_MESSAGE);

  useEffect(() => {
    const onLimit = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      if (!isCommunityWorkspaceLimitMessage(detail?.message)) return;
      setMessage(detail?.message || COMMUNITY_WORKSPACE_LIMIT_MESSAGE);
      setOpen(true);
    };
    window.addEventListener(COMMUNITY_WORKSPACE_LIMIT_EVENT, onLimit);
    return () => window.removeEventListener(COMMUNITY_WORKSPACE_LIMIT_EVENT, onLimit);
  }, []);

  return (
    <UpgradePrompt
      open={open}
      onOpenChange={setOpen}
      featureId="enterprise.workspaces"
      featureName="Additional workspaces"
      featureDescription={message}
    />
  );
}
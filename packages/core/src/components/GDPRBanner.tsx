import React, { useState, useEffect } from "react";
import { Button } from "@complianceos/ui/ui/button";
import { X } from "lucide-react";
import { useLocation } from "wouter";
import { readMarketingConsentFlag } from "@/lib/runtimeConfig";

const CONSENT_KEY = "complianceos-cookie-consent";

/**
 * Off unless GRC_COOKIE_CONSENT=1 (or VITE_COOKIE_CONSENT at build time).
 * Accepting does not load advertising, analytics, or any other third-party script.
 * Strictly necessary session storage does not use this notice.
 */
export default function GDPRBanner() {
  const [location] = useLocation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!readMarketingConsentFlag()) {
      setIsVisible(false);
      return;
    }

    const isMainApp = location.startsWith('/clients') ||
                      location.startsWith('/dashboard') ||
                      location.startsWith('/admin') ||
                      location.startsWith('/settings') ||
                      location.startsWith('/risks') ||
                      location.startsWith('/compliance') ||
                      location.startsWith('/tprm');

    if (isMainApp) {
      setIsVisible(false);
      return;
    }

    const consent = localStorage.getItem(CONSENT_KEY);
    setIsVisible(!consent);
  }, [location]);

  const savePreference = () => {
    localStorage.setItem(CONSENT_KEY, "true");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg z-50 p-4 md:p-6 animate-in slide-in-from-bottom-5">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex-1 space-y-2">
          <h3 className="font-semibold text-lg">Optional browser preference</h3>
          <p className="text-sm text-muted-foreground">
            GRCompliance does not load advertising, analytics, or other third-party tracking scripts.
            Sign-in uses strictly necessary session storage and does not need this choice.
            Saving the preference only records it in this browser.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Button variant="outline" size="sm" onClick={() => setIsVisible(false)} className="w-full md:w-auto">
            Dismiss
          </Button>
          <Button size="sm" onClick={savePreference} className="w-full md:w-auto">
            Save preference
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setIsVisible(false)} className="absolute top-2 right-2 md:hidden">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

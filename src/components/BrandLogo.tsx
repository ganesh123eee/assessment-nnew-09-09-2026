import React, { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

export interface BrandLogoProps {
  className?: string;
  imgClassName?: string;
  fallbackIconClassName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'auto';
  showAppName?: boolean;
  appNameClassName?: string;
  companyNameClassName?: string;
  customLogoUrl?: string; // allow overriding logoUrl if needed (e.g. in preview)
  customAppName?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className,
  imgClassName,
  fallbackIconClassName,
  size = 'md',
  showAppName = false,
  appNameClassName,
  companyNameClassName,
  customLogoUrl,
  customAppName,
}) => {
  const { branding } = useAuth();
  const [hasError, setHasError] = useState(false);

  // If customLogoUrl is provided, use it. If branding has logoUrl, use it. Otherwise fall back to /logo.svg
  const effectiveLogoUrl = customLogoUrl !== undefined 
    ? customLogoUrl 
    : (branding?.logoUrl || '/logo.svg');
  const effectiveAppName = customAppName || branding?.appName || 'AssessPro';

  // Reset error state when logoUrl changes
  useEffect(() => {
    setHasError(false);
  }, [effectiveLogoUrl]);

  const sizeDimensions = {
    xs: { container: 'h-6 w-6 rounded-md', img: 'h-6 w-auto max-w-[4rem]', icon: 'w-3.5 h-3.5' },
    sm: { container: 'h-8 w-8 rounded-lg', img: 'h-8 w-auto max-w-[6rem]', icon: 'w-4 h-4' },
    md: { container: 'h-9 w-9 rounded-xl', img: 'h-9 w-auto max-w-[8rem]', icon: 'w-5 h-5' },
    lg: { container: 'h-12 w-12 rounded-xl', img: 'h-12 w-auto max-w-[10rem]', icon: 'w-6 h-6' },
    xl: { container: 'h-16 w-16 rounded-2xl', img: 'h-16 w-auto max-w-[14rem]', icon: 'w-8 h-8' },
    auto: { container: 'h-full w-auto', img: 'h-full w-auto max-w-full', icon: 'w-5 h-5' },
  };

  const currentSize = sizeDimensions[size] || sizeDimensions.md;
  const isImageAvailable = Boolean(effectiveLogoUrl && effectiveLogoUrl.trim() !== '' && !hasError);

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden shrink-0 transition-all",
          isImageAvailable ? "h-auto w-auto" : cn(currentSize.container, "bg-primary/10 border border-primary/20 text-primary")
        )}
      >
        {isImageAvailable ? (
          <img
            src={effectiveLogoUrl}
            alt={effectiveAppName}
            className={cn(
              "object-contain rounded-lg transition-transform",
              currentSize.img,
              imgClassName
            )}
            onError={() => setHasError(true)}
            referrerPolicy="no-referrer"
          />
        ) : (
          <ShieldCheck className={cn(currentSize.icon, "text-primary shrink-0", fallbackIconClassName)} />
        )}
      </div>

      {showAppName && (
        <div className="flex flex-col min-w-0">
          <span className={cn("font-bold tracking-tight truncate leading-tight text-foreground text-base", appNameClassName)}>
            {effectiveAppName}
          </span>
          {branding?.companyName && (
            <span className={cn("text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate", companyNameClassName)}>
              {branding.companyName}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

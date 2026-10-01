/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Footprints, Image as ImageIcon, Maximize2, X } from 'lucide-react';

interface ProductThumbnailProps {
  src?: string;
  alt?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  allowZoom?: boolean;
  showFallback?: boolean;
}

export const ProductThumbnail: React.FC<ProductThumbnailProps> = ({
  src,
  alt = 'BLKBRD Handcrafted Footwear',
  size = 'md',
  className = '',
  allowZoom = true,
  showFallback = true
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  const cleanSrc = src && typeof src === 'string' && src.trim().length > 0 ? src.trim() : '';

  // Dimension classes
  const sizeClasses = {
    xs: 'w-8 h-8 rounded-lg text-[10px]',
    sm: 'w-10 h-10 rounded-xl text-xs',
    md: 'w-14 h-14 sm:w-16 sm:h-16 rounded-2xl text-xs',
    lg: 'w-20 h-20 rounded-2xl text-sm',
    xl: 'w-28 h-28 rounded-3xl text-base'
  }[size];

  if (!cleanSrc || imageError) {
    if (!showFallback) return null;
    return (
      <div
        className={`bg-neutral-100/90 border border-neutral-200/80 flex flex-col items-center justify-center text-neutral-400 shrink-0 select-none ${sizeClasses} ${className}`}
        title={alt}
      >
        <Footprints className="w-1/2 h-1/2 stroke-[1.5] text-neutral-400" />
      </div>
    );
  }

  return (
    <>
      <div
        onClick={() => {
          if (allowZoom) setIsZoomed(true);
        }}
        className={`relative group shrink-0 overflow-hidden bg-neutral-50 border border-neutral-200/80 cursor-pointer shadow-2xs ${sizeClasses} ${className}`}
        title={`${alt} (click to expand)`}
      >
        {!imageLoaded && (
          <div className="absolute inset-0 bg-neutral-100 animate-pulse flex items-center justify-center">
            <ImageIcon className="w-1/3 h-1/3 text-neutral-400" />
          </div>
        )}
        <img
          src={cleanSrc}
          alt={alt}
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          className={`w-full h-full object-cover rounded-inherit transition-transform duration-300 group-hover:scale-105 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {allowZoom && (
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
            <Maximize2 className="w-3.5 h-3.5 drop-shadow-sm" />
          </div>
        )}
      </div>

      {/* Lightbox Zoom Modal */}
      {isZoomed && (
        <div
          className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setIsZoomed(false)}
        >
          <div
            className="relative max-w-xl max-h-[90vh] bg-white rounded-3xl p-3 border border-neutral-200 shadow-2xl space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Footprints className="w-4 h-4 text-amber-600" />
                <span className="font-semibold text-xs text-neutral-900 truncate max-w-xs">{alt}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsZoomed(false)}
                className="p-1 rounded-full hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden bg-neutral-100 max-h-[70vh] flex items-center justify-center">
              <img
                src={cleanSrc}
                alt={alt}
                referrerPolicy="no-referrer"
                className="max-h-[68vh] w-auto object-contain rounded-xl"
              />
            </div>
            <div className="px-2 pb-1 text-[11px] text-neutral-500 text-center font-mono">
              Shopify Product Image Feed
            </div>
          </div>
        </div>
      )}
    </>
  );
};

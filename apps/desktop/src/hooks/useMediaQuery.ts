import { useState, useEffect } from 'react';

/**
 * Hook to detect if a media query matches
 * @param query - CSS media query string (e.g., '(max-width: 767px)')
 * @returns boolean indicating if the media query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    // Initialize with the current value (for SSR safety, default to false)
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

/**
 * Hook to detect if the viewport is mobile-sized (< 768px)
 * @returns boolean indicating if viewport is mobile
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

/**
 * Hook to detect if the viewport is tablet-sized (768px - 1023px)
 * @returns boolean indicating if viewport is tablet
 */
export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
}

/**
 * Hook to detect if the viewport is desktop-sized (>= 1024px)
 * @returns boolean indicating if viewport is desktop
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}

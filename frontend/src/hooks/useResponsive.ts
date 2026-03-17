import { useState, useEffect } from 'react';

// Breakpoint definitions
export const breakpoints = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
} as const;

export type Breakpoint = keyof typeof breakpoints;

interface ResponsiveState {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
  isLandscape: boolean;
  isPortrait: boolean;
  isTouchDevice: boolean;
}

/**
 * Custom hook for responsive design
 * Provides current viewport information and breakpoint detection
 */
export function useResponsive(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>(() => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const height = typeof window !== 'undefined' ? window.innerHeight : 768;
    const breakpoint = getBreakpoint(width);

    return {
      width,
      height,
      breakpoint,
      isMobile: breakpoint === 'mobile',
      isTablet: breakpoint === 'tablet',
      isDesktop: breakpoint === 'desktop',
      isWide: breakpoint === 'wide',
      isLandscape: width > height,
      isPortrait: height >= width,
      isTouchDevice: typeof window !== 'undefined' && 'ontouchstart' in window,
    };
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const breakpoint = getBreakpoint(width);

      setState({
        width,
        height,
        breakpoint,
        isMobile: breakpoint === 'mobile',
        isTablet: breakpoint === 'tablet',
        isDesktop: breakpoint === 'desktop',
        isWide: breakpoint === 'wide',
        isLandscape: width > height,
        isPortrait: height >= width,
        isTouchDevice: 'ontouchstart' in window,
      });
    };

    // Add resize listener
    window.addEventListener('resize', handleResize);

    // Initial call
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return state;
}

/**
 * Get the current breakpoint based on window width
 */
function getBreakpoint(width: number): Breakpoint {
  if (width >= breakpoints.wide) return 'wide';
  if (width >= breakpoints.desktop) return 'desktop';
  if (width >= breakpoints.tablet) return 'tablet';
  return 'mobile';
}

/**
 * Hook to detect if a specific breakpoint is active
 */
export function useBreakpoint(breakpoint: Breakpoint): boolean {
  const responsive = useResponsive();
  const breakpointValue = breakpoints[breakpoint];
  const nextBreakpointValue = getNextBreakpointValue(breakpoint);

  if (nextBreakpointValue === null) {
    return responsive.width >= breakpointValue;
  }

  return responsive.width >= breakpointValue && responsive.width < nextBreakpointValue;
}

/**
 * Get the next breakpoint value
 */
function getNextBreakpointValue(breakpoint: Breakpoint): number | null {
  const orderedBreakpoints: Breakpoint[] = ['mobile', 'tablet', 'desktop', 'wide'];
  const currentIndex = orderedBreakpoints.indexOf(breakpoint);

  if (currentIndex === -1 || currentIndex === orderedBreakpoints.length - 1) {
    return null;
  }

  return breakpoints[orderedBreakpoints[currentIndex + 1]];
}

/**
 * Hook to detect if the viewport is at least a certain breakpoint
 */
export function useMinBreakpoint(breakpoint: Breakpoint): boolean {
  const responsive = useResponsive();
  return responsive.width >= breakpoints[breakpoint];
}

/**
 * Hook to detect if the viewport is at most a certain breakpoint
 */
export function useMaxBreakpoint(breakpoint: Breakpoint): boolean {
  const responsive = useResponsive();
  const nextBreakpointValue = getNextBreakpointValue(breakpoint);

  if (nextBreakpointValue === null) {
    return true;
  }

  return responsive.width < nextBreakpointValue;
}

/**
 * Hook for media query matching
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);

    // Set initial value
    setMatches(mediaQuery.matches);

    // Define listener
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Add listener
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', listener);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(listener);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', listener);
      } else {
        // Fallback for older browsers
        mediaQuery.removeListener(listener);
      }
    };
  }, [query]);

  return matches;
}

/**
 * Hook to get responsive value based on current breakpoint
 */
export function useResponsiveValue<T>(values: {
  mobile?: T;
  tablet?: T;
  desktop?: T;
  wide?: T;
  default: T;
}): T {
  const { breakpoint } = useResponsive();

  // Return the value for the current breakpoint, or fall through to smaller breakpoints
  switch (breakpoint) {
    case 'wide':
      return values.wide ?? values.desktop ?? values.tablet ?? values.mobile ?? values.default;
    case 'desktop':
      return values.desktop ?? values.tablet ?? values.mobile ?? values.default;
    case 'tablet':
      return values.tablet ?? values.mobile ?? values.default;
    case 'mobile':
      return values.mobile ?? values.default;
    default:
      return values.default;
  }
}

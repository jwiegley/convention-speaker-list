import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '../store';

// Keyboard shortcuts mapping
const KEYBOARD_SHORTCUTS = {
  // Navigation
  'Ctrl+K': 'openSearch',
  'Ctrl+/': 'showShortcuts',
  'Escape': 'closeModal',
  'Alt+1': 'navigateQueue',
  'Alt+2': 'navigateSpectator',
  'Alt+3': 'navigateAdmin',
  'Alt+4': 'navigateAnalytics',
  
  // Queue operations
  'Ctrl+Enter': 'advanceQueue',
  'Ctrl+A': 'addSpeaker',
  'Ctrl+R': 'removeSpeaker',
  'Ctrl+T': 'toggleTimer',
  
  // Accessibility
  'Alt+H': 'showHelp',
  'Alt+S': 'skipToContent',
  'Alt+N': 'announceNext',
  'Alt+C': 'announceCurrent',
} as const;

type ShortcutAction = typeof KEYBOARD_SHORTCUTS[keyof typeof KEYBOARD_SHORTCUTS];

interface UseKeyboardNavigationOptions {
  onSearch?: () => void;
  onShowShortcuts?: () => void;
  onCloseModal?: () => void;
  onAdvanceQueue?: () => void;
  onAddSpeaker?: () => void;
  onRemoveSpeaker?: () => void;
  onToggleTimer?: () => void;
  onShowHelp?: () => void;
  customHandlers?: Partial<Record<ShortcutAction, () => void>>;
}

/**
 * Hook for keyboard navigation and shortcuts
 */
export function useKeyboardNavigation(options: UseKeyboardNavigationOptions = {}) {
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Build the key combination string
      const key = [];
      if (e.ctrlKey || e.metaKey) key.push('Ctrl');
      if (e.altKey) key.push('Alt');
      if (e.shiftKey) key.push('Shift');
      
      // Add the actual key
      if (e.key === ' ') {
        key.push('Space');
      } else if (e.key.length === 1) {
        key.push(e.key.toUpperCase());
      } else {
        key.push(e.key);
      }
      
      const combination = key.join('+');
      const action = KEYBOARD_SHORTCUTS[combination as keyof typeof KEYBOARD_SHORTCUTS];
      
      if (action) {
        e.preventDefault();
        
        // Handle built-in actions
        switch (action) {
          case 'openSearch':
            options.onSearch?.();
            break;
          case 'showShortcuts':
            setIsShortcutsModalOpen(true);
            options.onShowShortcuts?.();
            break;
          case 'closeModal':
            setIsShortcutsModalOpen(false);
            options.onCloseModal?.();
            break;
          case 'navigateQueue':
            window.location.href = '/';
            break;
          case 'navigateSpectator':
            window.location.href = '/spectator';
            break;
          case 'navigateAdmin':
            window.location.href = '/admin';
            break;
          case 'navigateAnalytics':
            window.location.href = '/analytics';
            break;
          case 'advanceQueue':
            options.onAdvanceQueue?.();
            break;
          case 'addSpeaker':
            options.onAddSpeaker?.();
            break;
          case 'removeSpeaker':
            options.onRemoveSpeaker?.();
            break;
          case 'toggleTimer':
            options.onToggleTimer?.();
            break;
          case 'showHelp':
            options.onShowHelp?.();
            break;
          case 'skipToContent':
            document.getElementById('main-content')?.focus();
            break;
          case 'announceNext':
            announceToScreenReader('Next speaker announcement');
            break;
          case 'announceCurrent':
            announceToScreenReader('Current speaker announcement');
            break;
        }
        
        // Handle custom handlers
        options.customHandlers?.[action]?.();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [options]);
  
  return {
    isShortcutsModalOpen,
    setIsShortcutsModalOpen,
  };
}

/**
 * Hook for focus management
 */
export function useFocusTrap(containerRef: React.RefObject<HTMLElement>, isActive = true) {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;
    
    const container = containerRef.current;
    const focusableElements = container.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
    
    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };
    
    container.addEventListener('keydown', handleTabKey);
    firstElement?.focus();
    
    return () => {
      container.removeEventListener('keydown', handleTabKey);
    };
  }, [containerRef, isActive]);
}

/**
 * Hook for managing focus restoration
 */
export function useFocusRestoration() {
  const lastFocusedElement = useRef<HTMLElement | null>(null);
  
  const saveFocus = useCallback(() => {
    lastFocusedElement.current = document.activeElement as HTMLElement;
  }, []);
  
  const restoreFocus = useCallback(() => {
    if (lastFocusedElement.current && lastFocusedElement.current.focus) {
      lastFocusedElement.current.focus();
    }
  }, []);
  
  return { saveFocus, restoreFocus };
}

/**
 * Hook for ARIA live region announcements
 */
export function useLiveAnnouncer() {
  const [announcement, setAnnouncement] = useState('');
  const [politeness, setPoliteness] = useState<'polite' | 'assertive'>('polite');
  
  const announce = useCallback((message: string, level: 'polite' | 'assertive' = 'polite') => {
    setPoliteness(level);
    setAnnouncement(message);
    
    // Clear the announcement after a short delay to allow re-announcement of the same message
    setTimeout(() => setAnnouncement(''), 100);
  }, []);
  
  return {
    announcement,
    politeness,
    announce,
  };
}

/**
 * Global function to announce to screen readers
 */
let announcer: HTMLDivElement | null = null;

export function announceToScreenReader(message: string, politeness: 'polite' | 'assertive' = 'polite') {
  if (!announcer) {
    announcer = document.createElement('div');
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', politeness);
    announcer.setAttribute('aria-atomic', 'true');
    announcer.style.position = 'absolute';
    announcer.style.left = '-10000px';
    announcer.style.width = '1px';
    announcer.style.height = '1px';
    announcer.style.overflow = 'hidden';
    document.body.appendChild(announcer);
  }
  
  announcer.setAttribute('aria-live', politeness);
  announcer.textContent = message;
  
  // Clear after announcement
  setTimeout(() => {
    if (announcer) {
      announcer.textContent = '';
    }
  }, 1000);
}

/**
 * Hook for reduced motion preference
 */
export function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }
    
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);
  
  return prefersReducedMotion;
}

/**
 * Hook for high contrast mode detection
 */
export function useHighContrast() {
  const [prefersHighContrast, setPrefersHighContrast] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-contrast: high)');
    setPrefersHighContrast(mediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersHighContrast(e.matches);
    };
    
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }
    
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);
  
  return prefersHighContrast;
}

/**
 * Hook for managing roving tabindex in lists
 */
export function useRovingTabIndex(items: HTMLElement[]) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  
  useEffect(() => {
    items.forEach((item, index) => {
      item.setAttribute('tabindex', index === focusedIndex ? '0' : '-1');
    });
  }, [items, focusedIndex]);
  
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % items.length);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + items.length) % items.length);
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(items.length - 1);
        break;
    }
  }, [items.length]);
  
  useEffect(() => {
    items[focusedIndex]?.focus();
  }, [focusedIndex, items]);
  
  return {
    focusedIndex,
    handleKeyDown,
  };
}

/**
 * Component for skip links
 */
export function SkipLinks() {
  return (
    <div className="skip-links">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <a href="#navigation" className="skip-link">
        Skip to navigation
      </a>
      <a href="#queue" className="skip-link">
        Skip to speaker queue
      </a>
    </div>
  );
}

/**
 * Component for keyboard shortcuts modal
 */
export function KeyboardShortcutsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen);
  const { saveFocus, restoreFocus } = useFocusRestoration();
  
  useEffect(() => {
    if (isOpen) {
      saveFocus();
    } else {
      restoreFocus();
    }
  }, [isOpen, saveFocus, restoreFocus]);
  
  if (!isOpen) return null;
  
  return (
    <div 
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div 
        ref={modalRef}
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
        <button
          onClick={onClose}
          className="close-button"
          aria-label="Close shortcuts modal"
        >
          ×
        </button>
        
        <div className="shortcuts-list">
          <h3>Navigation</h3>
          <dl>
            <dt>Ctrl + K</dt>
            <dd>Open search</dd>
            <dt>Alt + 1-4</dt>
            <dd>Navigate to different views</dd>
            <dt>Tab</dt>
            <dd>Navigate through elements</dd>
            <dt>Escape</dt>
            <dd>Close modals</dd>
          </dl>
          
          <h3>Queue Operations</h3>
          <dl>
            <dt>Ctrl + Enter</dt>
            <dd>Advance queue</dd>
            <dt>Ctrl + A</dt>
            <dd>Add speaker</dd>
            <dt>Ctrl + R</dt>
            <dd>Remove speaker</dd>
            <dt>Ctrl + T</dt>
            <dd>Toggle timer</dd>
          </dl>
          
          <h3>Accessibility</h3>
          <dl>
            <dt>Alt + H</dt>
            <dd>Show help</dd>
            <dt>Alt + S</dt>
            <dd>Skip to content</dd>
            <dt>Alt + N</dt>
            <dd>Announce next speaker</dd>
            <dt>Alt + C</dt>
            <dd>Announce current speaker</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}

/**
 * Live region component for dynamic announcements
 */
export function LiveRegion({ message, politeness = 'polite' }: { message: string; politeness?: 'polite' | 'assertive' }) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
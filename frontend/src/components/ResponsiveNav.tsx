import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useResponsive } from '../hooks/useResponsive';

interface NavItem {
  path: string;
  label: string;
  icon?: string;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Queue', icon: '📋' },
  { path: '/spectator', label: 'Spectator', icon: '👁️' },
  { path: '/admin', label: 'Admin', icon: '⚙️' },
  { path: '/analytics', label: 'Analytics', icon: '📊' },
];

export function ResponsiveNav() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { isMobile, isTablet } = useResponsive();

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  // Mobile navigation (bottom bar or hamburger menu)
  if (isMobile) {
    return (
      <>
        {/* Hamburger button */}
        <button
          className="hamburger-menu fixed top-4 right-4 z-50"
          onClick={toggleMobileMenu}
          aria-label="Toggle navigation menu"
          aria-expanded={isMobileMenuOpen}
        >
          <div className={`hamburger-line ${isMobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <div className={`hamburger-line ${isMobileMenuOpen ? 'opacity-0' : ''}`} />
          <div className={`hamburger-line ${isMobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>

        {/* Mobile menu overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black bg-opacity-50 z-40"
                onClick={toggleMobileMenu}
              />
              <motion.nav
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.3 }}
                className="fixed right-0 top-0 bottom-0 w-64 bg-white shadow-lg z-40 pt-16"
              >
                <ul className="space-y-2 p-4">
                  {navItems.map((item) => (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                          location.pathname === item.path
                            ? 'bg-blue-100 text-blue-600'
                            : 'hover:bg-gray-100'
                        }`}
                        onClick={toggleMobileMenu}
                      >
                        <span className="text-xl">{item.icon}</span>
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </motion.nav>
            </>
          )}
        </AnimatePresence>

        {/* Bottom navigation bar for mobile */}
        <nav className="mobile-nav fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30">
          <div className="flex justify-around items-center h-16">
            {navItems.slice(0, 4).map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center flex-1 h-full ${
                  location.pathname === item.path
                    ? 'text-blue-600'
                    : 'text-gray-600'
                }`}
              >
                <span className="text-xl mb-1">{item.icon}</span>
                <span className="text-xs">{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      </>
    );
  }

  // Tablet navigation (compact top bar)
  if (isTablet) {
    return (
      <nav className="desktop-nav bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900">Speaker Queue</h1>
            </div>
            <div className="flex items-center gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === item.path
                      ? 'bg-blue-100 text-blue-600'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </nav>
    );
  }

  // Desktop navigation (full top bar)
  return (
    <nav className="desktop-nav bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold text-gray-900">
              Convention Speaker List Manager
            </h1>
            <div className="flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === item.path
                      ? 'bg-blue-100 text-blue-600'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              Connected: <span className="text-green-600">●</span> Live
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}

// Keyboard navigation hook
export function useKeyboardNavigation() {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt + number for quick navigation
      if (e.altKey && e.key >= '1' && e.key <= '4') {
        const index = parseInt(e.key) - 1;
        if (navItems[index]) {
          window.location.href = navItems[index].path;
        }
      }
      
      // Escape to close mobile menu
      if (e.key === 'Escape') {
        const event = new CustomEvent('closeMobileMenu');
        window.dispatchEvent(event);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
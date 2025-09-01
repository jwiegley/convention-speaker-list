import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SpectatorView } from './views/SpectatorView';
import { AdminView } from './views/AdminView';
import { TestView } from './views/TestView';
import { ResponsiveNav, useKeyboardNavigation } from './components/ResponsiveNav';
import './App.css';
import './styles/responsive.css';

// Create a query client instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  // Enable keyboard navigation
  useKeyboardNavigation();

  return (
    <div className="min-h-screen bg-gray-50">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <ResponsiveNav />
      <main id="main-content" className="container mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<SpectatorView />} />
          <Route path="/admin" element={<AdminView />} />
          <Route path="/test" element={<TestView />} />
          <Route path="/analytics" element={<div className="p-8 text-center text-gray-600">Analytics view coming soon</div>} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AppContent />
      </Router>
    </QueryClientProvider>
  );
}

export default App;
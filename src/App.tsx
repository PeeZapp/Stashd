import { useEffect, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import ProfilePage from './components/ProfilePage';
import SharedListView from './components/SharedListView';
import SharedProductView from './components/SharedProductView';
import { normalizeShareToken } from './lib/shareLink';

type Route =
  | { type: 'landing' }
  | { type: 'dashboard'; prefillUrl?: string }
  | { type: 'profile' }
  | { type: 'shared-list'; param: string }
  | { type: 'shared-product'; param: string };

function getInitialRoute(): Route {
  const path = window.location.pathname;
  if (path.startsWith('/share/list/')) {
    return { type: 'shared-list', param: normalizeShareToken(path.slice('/share/list/'.length)) };
  }
  if (path.startsWith('/share/product/')) {
    return { type: 'shared-product', param: normalizeShareToken(path.slice('/share/product/'.length)) };
  }
  if (path === '/add') {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('url') ?? undefined;
    return { type: 'dashboard', prefillUrl: url };
  }
  if (path === '/profile') {
    return { type: 'profile' };
  }
  return { type: 'landing' };
}

function App() {
  const { user, loading } = useAuth();
  const [route, setRoute] = useState<Route>(getInitialRoute);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/share/')) return;

    if (user) {
      setRoute((prev) => {
        if (prev.type === 'profile') return prev;
        return {
          type: 'dashboard',
          prefillUrl: prev.type === 'dashboard' ? prev.prefillUrl : undefined,
        };
      });
    } else {
      setRoute({ type: 'landing' });
    }
  }, [user]);

  const goToProfile = () => {
    window.history.pushState({}, '', '/profile');
    setRoute({ type: 'profile' });
  };

  const goToDashboard = () => {
    window.history.pushState({}, '', '/');
    setRoute({ type: 'dashboard' });
  };

  if (route.type === 'shared-list') {
    return <SharedListView shareToken={route.param} />;
  }

  if (route.type === 'shared-product') {
    return <SharedProductView productId={route.param} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (user) {
    if (route.type === 'profile') {
      return <ProfilePage onBack={goToDashboard} />;
    }
    return (
      <Dashboard
        prefillUrl={route.type === 'dashboard' ? route.prefillUrl : undefined}
        onNavigateToProfile={goToProfile}
      />
    );
  }

  return <LandingPage />;
}

export default App;

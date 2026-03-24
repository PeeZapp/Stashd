import { useEffect, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import SharedListView from './components/SharedListView';
import SharedProductView from './components/SharedProductView';

type Route =
  | { type: 'landing' }
  | { type: 'dashboard'; prefillUrl?: string }
  | { type: 'shared-list'; param: string }
  | { type: 'shared-product'; param: string };

function getInitialRoute(): Route {
  const path = window.location.pathname;
  if (path.startsWith('/share/list/')) {
    return { type: 'shared-list', param: path.replace('/share/list/', '') };
  }
  if (path.startsWith('/share/product/')) {
    return { type: 'shared-product', param: path.replace('/share/product/', '') };
  }
  if (path === '/add') {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('url') ?? undefined;
    return { type: 'dashboard', prefillUrl: url };
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
      // Preserve prefillUrl if already set (e.g. bookmarklet navigation)
      setRoute((prev) => ({
        type: 'dashboard',
        prefillUrl: prev.type === 'dashboard' ? prev.prefillUrl : undefined,
      }));
    } else {
      setRoute({ type: 'landing' });
    }
  }, [user]);

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
    return <Dashboard prefillUrl={route.type === 'dashboard' ? route.prefillUrl : undefined} />;
  }

  return <LandingPage />;
}

export default App;

import { useEffect, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import SharedListView from './components/SharedListView';
import SharedProductView from './components/SharedProductView';

function App() {
  const { user, loading } = useAuth();
  const [route, setRoute] = useState<{
    type: 'landing' | 'dashboard' | 'shared-list' | 'shared-product';
    param?: string;
  }>({ type: 'landing' });

  useEffect(() => {
    const path = window.location.pathname;

    if (path.startsWith('/share/list/')) {
      const token = path.replace('/share/list/', '');
      setRoute({ type: 'shared-list', param: token });
    } else if (path.startsWith('/share/product/')) {
      const productId = path.replace('/share/product/', '');
      setRoute({ type: 'shared-product', param: productId });
    } else if (user) {
      setRoute({ type: 'dashboard' });
    } else {
      setRoute({ type: 'landing' });
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (route.type === 'shared-list' && route.param) {
    return <SharedListView shareToken={route.param} />;
  }

  if (route.type === 'shared-product' && route.param) {
    return <SharedProductView productId={route.param} />;
  }

  if (user) {
    return <Dashboard />;
  }

  return <LandingPage />;
}

export default App;

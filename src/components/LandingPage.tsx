import { useState } from 'react';
import { Heart, List, Share2, ShoppingBag } from 'lucide-react';
import AuthModal from './AuthModal';

export default function LandingPage() {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');

  const openAuth = (mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    setShowAuth(true);
  };

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShoppingBag className="w-8 h-8 text-gray-900" strokeWidth={1.5} />
            <span className="text-2xl font-semibold text-gray-900">Stashd</span>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => openAuth('signin')}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => openAuth('signup')}
              className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      <main>
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Save products from anywhere. Organize everything.
            </h1>
            <p className="text-xl text-gray-600 mb-10 leading-relaxed">
              Your universal wishlist. Save items from any store, track prices and sales,
              organize into lists, and share with friends.
            </p>
            <button
              onClick={() => openAuth('signup')}
              className="px-8 py-4 bg-gray-900 text-white text-lg rounded-lg hover:bg-gray-800 transition-all transform hover:scale-105"
            >
              Start Saving Products
            </button>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShoppingBag className="w-8 h-8 text-gray-900" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Save From Anywhere</h3>
              <p className="text-gray-600">
                Add products from any online store with a simple URL paste
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Heart className="w-8 h-8 text-gray-900" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Track Sales</h3>
              <p className="text-gray-600">
                See when items go on sale and track your savings
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <List className="w-8 h-8 text-gray-900" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Organize Lists</h3>
              <p className="text-gray-600">
                Create custom lists for birthdays, holidays, or any occasion
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Share2 className="w-8 h-8 text-gray-900" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Share Easily</h3>
              <p className="text-gray-600">
                Share products or entire lists with friends and family
              </p>
            </div>
          </div>
        </section>

        <section className="bg-gray-50 py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-6">
              Ready to organize your wishlist?
            </h2>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Join thousands of shoppers who use Stashd to save and organize products they love.
            </p>
            <button
              onClick={() => openAuth('signup')}
              className="px-8 py-4 bg-gray-900 text-white text-lg rounded-lg hover:bg-gray-800 transition-colors"
            >
              Get Started Free
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-600">
          <p>&copy; 2024 Stashd. Your universal product saver.</p>
        </div>
      </footer>

      {showAuth && (
        <AuthModal
          mode={authMode}
          onClose={() => setShowAuth(false)}
          onSwitchMode={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
        />
      )}
    </div>
  );
}

import { useState } from 'react';
import { ArrowLeft, User, Palette, Trash2, AlertCircle, Check, ShoppingBag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { updateProfileName } from '../lib/firestore';
import { useTheme, THEMES } from '../contexts/ThemeContext';

interface ProfilePageProps {
  onBack: () => void;
}

export default function ProfilePage({ onBack }: ProfilePageProps) {
  const { user, profile, signOut, deleteAccount, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();

  const [username, setUsername] = useState(profile?.name ?? '');
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !username.trim()) return;
    setSavingUsername(true);
    setUsernameMsg(null);
    let error: Error | null = null;
    try {
      await updateProfileName(user.uid, username.trim());
    } catch (err) {
      error = err as Error;
    }
    setSavingUsername(false);
    if (error) {
      setUsernameMsg({ type: 'error', text: 'Could not save. Please try again.' });
    } else {
      await refreshProfile();
      setUsernameMsg({ type: 'success', text: 'Username updated.' });
      setTimeout(() => setUsernameMsg(null), 3000);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteInput.trim().toLowerCase() !== 'delete') return;
    setDeleting(true);
    setDeleteError('');
    const { error } = await deleteAccount();
    if (error) {
      setDeleteError('Something went wrong. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <ShoppingBag className="w-6 h-6 text-gray-900" strokeWidth={1.5} />
            <span className="text-lg font-semibold text-gray-900">Profile</span>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Account info */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{profile?.name || 'User'}</p>
              <p className="text-sm text-gray-500">{user?.email}</p>
            </div>
          </div>

          <form onSubmit={handleSaveUsername} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
                placeholder="Your display name"
              />
            </div>
            {usernameMsg && (
              <div className={`flex items-center space-x-2 text-sm ${usernameMsg.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
                {usernameMsg.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{usernameMsg.text}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={savingUsername || !username.trim() || username.trim() === profile?.name}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingUsername ? 'Saving…' : 'Save Username'}
            </button>
          </form>
        </section>

        {/* Theme picker */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center space-x-2 mb-5">
            <Palette className="w-5 h-5 text-gray-500" />
            <h2 className="text-base font-semibold text-gray-900">Colour Scheme</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`relative flex items-start space-x-3 p-4 rounded-xl border-2 transition-all text-left ${
                  theme === t.id ? 'border-gray-900 shadow-sm' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Swatch */}
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-10 h-10 rounded-lg overflow-hidden shadow-sm flex flex-col">
                    <div className="h-2/3" style={{ backgroundColor: t.primary }} />
                    <div className="h-1/3" style={{ backgroundColor: t.bg }} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                </div>
                {theme === t.id && (
                  <div className="absolute top-3 right-3">
                    <Check className="w-4 h-4 text-gray-900" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Sign out */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Session</h2>
          <button
            onClick={signOut}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            Sign Out
          </button>
        </section>

        {/* Delete account */}
        <section className="bg-white rounded-2xl border border-red-200 p-6">
          <h2 className="text-base font-semibold text-red-700 mb-1">Delete Account</h2>
          <p className="text-sm text-gray-500 mb-4">
            This permanently removes all your lists, products, and account data. This cannot be undone.
          </p>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete My Account</span>
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-700 font-medium">
                Type <span className="font-mono bg-gray-100 px-1 rounded">delete</span> to confirm:
              </p>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder="delete"
                className="w-full max-w-xs px-4 py-2 border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 text-sm"
              />
              {deleteError && (
                <div className="flex items-center space-x-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>{deleteError}</span>
                </div>
              )}
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting || deleteInput.trim().toLowerCase() !== 'delete'}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting…' : 'Yes, Delete Everything'}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); setDeleteError(''); }}
                  className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}

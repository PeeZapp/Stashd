import './index.css';

const missingFirebaseVars = [
  ['VITE_FIREBASE_API_KEY', import.meta.env.VITE_FIREBASE_API_KEY],
  ['VITE_FIREBASE_AUTH_DOMAIN', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN],
  ['VITE_FIREBASE_PROJECT_ID', import.meta.env.VITE_FIREBASE_PROJECT_ID],
  ['VITE_FIREBASE_STORAGE_BUCKET', import.meta.env.VITE_FIREBASE_STORAGE_BUCKET],
  ['VITE_FIREBASE_APP_ID', import.meta.env.VITE_FIREBASE_APP_ID],
].filter(([, value]) => !value);

const root = document.getElementById('root');

if (missingFirebaseVars.length > 0 && root) {
  root.innerHTML = `
    <div class="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div class="max-w-lg w-full bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h1 class="text-2xl font-bold text-gray-900 mb-2">Firebase config is missing</h1>
        <p class="text-gray-600 mb-4">
          Create <code class="font-mono text-sm bg-gray-100 px-1.5 py-0.5 rounded">.env.local</code>
          with the Firebase web app values, then restart <code class="font-mono text-sm bg-gray-100 px-1.5 py-0.5 rounded">npm run dev</code>.
        </p>
        <p class="text-sm font-medium text-gray-700 mb-2">Missing values:</p>
        <ul class="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-3 space-y-1">
          ${missingFirebaseVars.map(([key]) => `<li>${key}</li>`).join('')}
        </ul>
      </div>
    </div>
  `;
} else {
  void import('./bootstrap');
}

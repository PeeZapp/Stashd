# Firebase Storage for Stashd (local + production)

Outfit photos upload to **Firebase Storage** under `users/{uid}/outfitLooks/{outfitId}/...`. The web app uses the same Firebase project in dev and prod; only env values and deployed rules differ.

## 1. Enable Storage in the Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/) and select your project (e.g. `stashd-82e87`).
2. In the left sidebar, click **Build → Storage**.
3. Click **Get started**.
4. Choose **Start in production mode** (we lock paths down with `storage.rules` in this repo) or test mode temporarily — either way, deploy the rules in step 5 before relying on security.
5. Pick a **location** for the bucket (should match Firestore region if possible). Confirm.

After this, you have a default bucket like `your-project-id.appspot.com`.

## 2. Bucket name in environment variables

The Vite app reads **`VITE_FIREBASE_STORAGE_BUCKET`** from `.env.local` (local) and from your host’s env (production).

1. In Firebase Console: **Project settings** (gear) → **Your apps** → your web app, or **Storage** → **Files** — the bucket is shown as `gs://...` or `project-id.appspot.com`.
2. Set in **`.env.local`** (next to `package.json`):

   ```env
   VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
   ```

   Use the **bucket name only** (no `gs://`), matching what Firebase shows for the default bucket.

3. For **production** (Vercel, Netlify, etc.), add the same variable in the dashboard: `VITE_FIREBASE_STORAGE_BUCKET` = that bucket string.

4. Restart **`npm run dev`** after changing `.env.local` so Vite picks up new values.

## 3. Deploy Storage rules

This repo includes `storage.rules` (users can only write under their own `users/{userId}/outfitLooks/...` path).

From the project root (where `firebase.json` lives), with the CLI logged in and project selected (`firebase use`):

```bash
npx firebase-tools@latest deploy --only storage
```

Or together with Firestore:

```bash
npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes,storage
```

## 4. CORS and localhost

The Firebase JS SDK talks to `firebasestorage.googleapis.com` and your bucket URL. You **do not** need custom CORS for a normal Vite app on `http://localhost:5173` (or your dev port).

If you ever host the **HTML** on an unusual origin and uploads fail, check the browser Network tab; Firebase docs describe Storage CORS for edge cases.

## 5. Verify locally

1. `.env.local` has all `VITE_FIREBASE_*` keys (see `.env.example`), including **`VITE_FIREBASE_STORAGE_BUCKET`**.
2. Rules deployed: `firebase deploy --only storage`.
3. Run the app, sign in, **Owned → New outfit → Add** a small JPG/PNG. If it fails, the modal shows an error — common causes:
   - Wrong or missing `VITE_FIREBASE_STORAGE_BUCKET`
   - Storage not enabled in the project
   - Rules not deployed or user not signed in

## 6. Verify production

1. Build with the same env vars your host injects (`VITE_FIREBASE_STORAGE_BUCKET`, etc.).
2. Ensure **Storage rules** were deployed to the **same** Firebase project the production app uses.
3. Test upload signed in on the live URL.

## 7. Optional: separate dev vs prod projects

Use two Firebase projects (e.g. `stashd-dev` and `stashd-prod`), two `.firebaserc` aliases or two env files, and point local `.env.local` at dev and production hosting at prod. Rules and bucket setup repeat per project.

---

**Summary:** Enable Storage → set `VITE_FIREBASE_STORAGE_BUCKET` locally and on the host → `firebase deploy --only storage` → restart dev server → test an outfit photo upload.

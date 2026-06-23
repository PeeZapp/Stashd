import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';

export function isFirestorePermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === 'permission-denied';
}

export function formatFirestoreError(error: unknown, step?: string): string {
  const prefix = step ? `${step}: ` : '';
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code)
      : null;
  const detail = error instanceof Error ? error.message : null;

  if (code === 'permission-denied') {
    return (
      `${prefix}Could not save to your list (Firestore permission denied). ` +
      'Sign out and sign in again, then run `await diagnoseSaveToList()` in the browser console and share the result.'
    );
  }

  if (detail) return `${prefix}${detail}${code ? ` [${code}]` : ''}`;
  return `${prefix}Something went wrong while saving. Please try again.`;
}

/** Ensure Auth has restored the session and has a fresh ID token before Firestore writes. */
export async function ensureFirestoreAuth(forceRefresh = false): Promise<string> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to save. Try signing out and back in.');
  }
  await user.getIdToken(forceRefresh);
  return user.uid;
}

export async function withFirestoreAuth<T>(fn: () => Promise<T>): Promise<T> {
  await ensureFirestoreAuth(false);
  try {
    return await fn();
  } catch (error) {
    if (isFirestorePermissionDenied(error)) {
      await ensureFirestoreAuth(true);
      return await fn();
    }
    throw error;
  }
}

/** Dev helper — run in browser console: await diagnoseFirestore() */
export async function diagnoseFirestore(): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  };

  await auth.authStateReady();
  result.authReady = true;
  result.uid = auth.currentUser?.uid ?? null;
  result.email = auth.currentUser?.email ?? null;

  if (!auth.currentUser) {
    result.error = 'No signed-in user — auth token will not be sent to Firestore.';
    return result;
  }

  try {
    const token = await auth.currentUser.getIdToken();
    result.tokenOk = token.length > 0;
  } catch (e) {
    result.tokenError = e instanceof Error ? e.message : String(e);
    return result;
  }

  try {
    const listsSnap = await getDocs(
      query(collection(db, 'lists'), where('user_id', '==', auth.currentUser.uid), limit(1))
    );
    result.listsReadOk = true;
    result.sampleListCount = listsSnap.size;
  } catch (e) {
    result.listsReadOk = false;
    result.listsReadError = e instanceof Error ? e.message : String(e);
    result.listsReadCode = (e as { code?: string }).code ?? null;
  }

  try {
    const profileSnap = await getDoc(doc(db, 'profiles', auth.currentUser.uid));
    result.profileReadOk = profileSnap.exists();
  } catch (e) {
    result.profileReadOk = false;
    result.profileReadError = e instanceof Error ? e.message : String(e);
  }

  try {
    await withFirestoreAuth(async () => {
      const { addDoc, collection, deleteDoc, serverTimestamp } = await import('firebase/firestore');
      const ref = await addDoc(collection(db, 'lists'), {
        user_id: auth.currentUser!.uid,
        name: '__stashd_write_probe__',
        scope: 'wishlist',
        is_shared: false,
        share_token: null,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      await deleteDoc(ref);
    });
    result.listsWriteOk = true;
  } catch (e) {
    result.listsWriteOk = false;
    result.listsWriteError = e instanceof Error ? e.message : String(e);
    result.listsWriteCode = (e as { code?: string }).code ?? null;
  }

  return result;
}

/** Dev helper — tests the same writes as “save scraped product to list”. */
export async function diagnoseSaveToList(): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  const uid = await ensureFirestoreAuth();
  result.uid = uid;

  const { addDoc, collection, deleteDoc, serverTimestamp, doc } = await import(
    'firebase/firestore'
  );

  let productId: string | null = null;
  let listId: string | null = null;
  let linkId: string | null = null;

  try {
    const productRef = await addDoc(collection(db, 'products'), {
      user_id: uid,
      title: '__stashd_save_probe__',
      source_url: 'https://example.com/probe',
      current_price: null,
      original_price: null,
      is_on_sale: false,
      image_url: null,
      store_name: null,
      description: null,
      sku: null,
      price_source: null,
      is_owned: false,
      add_detail_level: 'quick',
      detailed_enrichment_pending: false,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    productId = productRef.id;
    result.productCreateOk = true;
  } catch (e) {
    result.productCreateOk = false;
    result.productCreateError = e instanceof Error ? e.message : String(e);
    result.productCreateCode = (e as { code?: string }).code ?? null;
    return result;
  }

  try {
    const listRef = await addDoc(collection(db, 'lists'), {
      user_id: uid,
      name: '__stashd_save_probe__',
      scope: 'wishlist',
      is_shared: false,
      share_token: null,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    listId = listRef.id;
    result.listCreateOk = true;
  } catch (e) {
    result.listCreateOk = false;
    result.listCreateError = e instanceof Error ? e.message : String(e);
    result.listCreateCode = (e as { code?: string }).code ?? null;
    return result;
  }

  try {
    const linkRef = await addDoc(collection(db, 'list_products'), {
      user_id: uid,
      list_id: listId,
      product_id: productId,
      added_at: serverTimestamp(),
    });
    linkId = linkRef.id;
    result.listProductCreateOk = true;
  } catch (e) {
    result.listProductCreateOk = false;
    result.listProductCreateError = e instanceof Error ? e.message : String(e);
    result.listProductCreateCode = (e as { code?: string }).code ?? null;
    return result;
  } finally {
    if (linkId) await deleteDoc(doc(db, 'list_products', linkId)).catch(() => {});
    if (listId) await deleteDoc(doc(db, 'lists', listId)).catch(() => {});
    if (productId) await deleteDoc(doc(db, 'products', productId)).catch(() => {});
  }

  result.cleanedUp = true;
  return result;
}

/** Wipe wishlist/stash lists and list links. Products, outfits, and Saves tab data are kept. */
export async function resetWishlists(): Promise<Record<string, unknown>> {
  const uid = await ensureFirestoreAuth();
  const { deleteAllProductLists } = await import('./firestore');
  const counts = await deleteAllProductLists(uid);
  return {
    ok: true,
    uid,
    ...counts,
    note:
      'Products are still saved — refresh the Wishlists tab to see them under "Unlisted products".',
  };
}

/** Dev helper — count saved products and how many are unlisted. */
export async function listSavedProducts(): Promise<Record<string, unknown>> {
  const uid = await ensureFirestoreAuth();
  const { getUserProducts, getUnlistedProducts } = await import('./firestore');
  const [all, unlisted] = await Promise.all([getUserProducts(uid), getUnlistedProducts(uid)]);
  return {
    uid,
    totalProducts: all.length,
    unlistedProducts: unlisted.length,
    listedProducts: all.length - unlisted.length,
    unlisted: unlisted.map((p) => ({ id: p.id, title: p.title })),
  };
}

/** Dev helper — probe adding to an existing list by name or id. */
export async function diagnoseAddToList(listNameOrId: string): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  const uid = await ensureFirestoreAuth();
  result.uid = uid;

  const { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, where } =
    await import('firebase/firestore');
  const { getUserLists } = await import('./firestore');

  const lists = await getUserLists(uid);
  const list =
    lists.find((l) => l.id === listNameOrId) ??
    lists.find((l) => l.name.toLowerCase() === listNameOrId.toLowerCase());
  if (!list) {
    result.error = `No list matching "${listNameOrId}". Your lists: ${lists.map((l) => l.name).join(', ') || '(none)'}`;
    return result;
  }
  result.list = { id: list.id, name: list.name, scope: list.scope, user_id: list.user_id };

  const listSnap = await getDoc(doc(db, 'lists', list.id));
  result.listDocExists = listSnap.exists();
  result.listDocUserId = listSnap.exists() ? listSnap.data()?.user_id ?? null : null;

  try {
    const linksSnap = await getDocs(
      query(collection(db, 'list_products'), where('user_id', '==', uid))
    );
    result.listProductsReadOk = true;
    result.listProductsForList = linksSnap.docs.filter((d) => d.data().list_id === list.id).length;
  } catch (e) {
    result.listProductsReadOk = false;
    result.listProductsReadError = e instanceof Error ? e.message : String(e);
    result.listProductsReadCode = (e as { code?: string }).code ?? null;
  }

  let productId: string | null = null;
  let linkId: string | null = null;
  try {
    const productRef = await addDoc(collection(db, 'products'), {
      user_id: uid,
      title: '__stashd_list_probe__',
      source_url: 'https://example.com/probe',
      current_price: null,
      original_price: null,
      is_on_sale: false,
      image_url: null,
      store_name: null,
      description: null,
      sku: null,
      price_source: null,
      is_owned: false,
      add_detail_level: 'quick',
      detailed_enrichment_pending: false,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    productId = productRef.id;
    result.productCreateOk = true;
  } catch (e) {
    result.productCreateOk = false;
    result.productCreateError = e instanceof Error ? e.message : String(e);
    return result;
  }

  try {
    const linkRef = await addDoc(collection(db, 'list_products'), {
      user_id: uid,
      list_id: list.id,
      product_id: productId,
      added_at: serverTimestamp(),
    });
    linkId = linkRef.id;
    result.listProductCreateOk = true;
  } catch (e) {
    result.listProductCreateOk = false;
    result.listProductCreateError = e instanceof Error ? e.message : String(e);
    result.listProductCreateCode = (e as { code?: string }).code ?? null;
  } finally {
    if (linkId) await deleteDoc(doc(db, 'list_products', linkId)).catch(() => {});
    if (productId) await deleteDoc(doc(db, 'products', productId)).catch(() => {});
  }

  return result;
}

if (import.meta.env.DEV) {
  const g = globalThis as typeof globalThis & {
    diagnoseFirestore?: typeof diagnoseFirestore;
    diagnoseSaveToList?: typeof diagnoseSaveToList;
    diagnoseAddToList?: typeof diagnoseAddToList;
    resetWishlists?: typeof resetWishlists;
    listSavedProducts?: typeof listSavedProducts;
  };
  g.diagnoseFirestore = diagnoseFirestore;
  g.diagnoseSaveToList = diagnoseSaveToList;
  g.diagnoseAddToList = diagnoseAddToList;
  g.resetWishlists = resetWishlists;
  g.listSavedProducts = listSavedProducts;
}

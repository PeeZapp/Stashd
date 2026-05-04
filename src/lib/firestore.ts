import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { normalizeShareToken } from './shareLink';
import type { List, ListProduct, Notification, PriceSource, Product, Profile } from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function asIso(value: unknown): string {
  if (!value) return nowIso();
  if (typeof value === 'string') return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return nowIso();
}

function mapProfile(id: string, data: DocumentData): Profile {
  return {
    id,
    name: (data.name as string) ?? '',
    email: (data.email as string) ?? '',
    created_at: asIso(data.created_at),
    updated_at: asIso(data.updated_at),
  };
}

function mapProduct(id: string, data: DocumentData): Product {
  return {
    id,
    user_id: data.user_id as string,
    title: (data.title as string) ?? '',
    current_price: typeof data.current_price === 'number' ? data.current_price : null,
    original_price: typeof data.original_price === 'number' ? data.original_price : null,
    is_on_sale: Boolean(data.is_on_sale),
    image_url: (data.image_url as string | null) ?? null,
    source_url: (data.source_url as string) ?? '',
    store_name: (data.store_name as string | null) ?? null,
    description: (data.description as string | null) ?? null,
    sku: (data.sku as string | null) ?? null,
    price_source: (data.price_source as PriceSource) ?? null,
    is_owned: Boolean(data.is_owned),
    created_at: asIso(data.created_at),
    updated_at: asIso(data.updated_at),
  };
}

function mapList(id: string, data: DocumentData): List {
  return {
    id,
    user_id: data.user_id as string,
    name: (data.name as string) ?? '',
    is_shared: Boolean(data.is_shared),
    share_token: (data.share_token as string | null) ?? null,
    created_at: asIso(data.created_at),
    updated_at: asIso(data.updated_at),
  };
}

function mapListProduct(id: string, data: DocumentData): ListProduct {
  return {
    id,
    user_id: data.user_id as string,
    list_id: data.list_id as string,
    product_id: data.product_id as string,
    added_at: asIso(data.added_at),
  };
}

function mapNotification(id: string, data: DocumentData): Notification {
  return {
    id,
    user_id: data.user_id as string,
    product_id: (data.product_id as string | null) ?? null,
    type: (data.type as Notification['type']) ?? 'price_drop',
    message: (data.message as string) ?? '',
    is_read: Boolean(data.is_read),
    created_at: asIso(data.created_at),
  };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const ref = doc(db, 'profiles', userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return mapProfile(snap.id, snap.data());
}

export async function upsertProfile(params: {
  id: string;
  email: string;
  name: string;
}): Promise<void> {
  const ref = doc(db, 'profiles', params.id);
  await setDoc(
    ref,
    {
      id: params.id,
      email: params.email,
      name: params.name,
      updated_at: serverTimestamp(),
      created_at: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function updateProfileName(userId: string, name: string): Promise<void> {
  const ref = doc(db, 'profiles', userId);
  await setDoc(
    ref,
    {
      name,
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function createProduct(
  payload: Omit<Product, 'id' | 'created_at' | 'updated_at'>
): Promise<Product> {
  const ref = await addDoc(collection(db, 'products'), {
    ...payload,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
  const snap = await getDoc(ref);
  return mapProduct(snap.id, snap.data() ?? payload);
}

export async function updateProduct(
  productId: string,
  updates: Partial<Omit<Product, 'id' | 'created_at' | 'updated_at' | 'user_id'>>
): Promise<Product | null> {
  const ref = doc(db, 'products', productId);
  await setDoc(
    ref,
    {
      ...updates,
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return mapProduct(snap.id, snap.data());
}

export async function deleteProduct(productId: string, userId: string): Promise<void> {
  const listProductsSnap = await getDocs(
    query(
      collection(db, 'list_products'),
      where('product_id', '==', productId),
      where('user_id', '==', userId)
    )
  );
  const batch = writeBatch(db);
  listProductsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'products', productId));
  await batch.commit();
}

export async function getUserLists(userId: string): Promise<List[]> {
  const snap = await getDocs(query(collection(db, 'lists'), where('user_id', '==', userId)));
  return snap.docs
    .map((d) => mapList(d.id, d.data()))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function createList(params: {
  user_id: string;
  name: string;
  share_token?: string | null;
}): Promise<List> {
  const ref = await addDoc(collection(db, 'lists'), {
    user_id: params.user_id,
    name: params.name,
    share_token: params.share_token ?? null,
    is_shared: false,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
  const snap = await getDoc(ref);
  return mapList(snap.id, snap.data() ?? params);
}

export async function updateList(
  listId: string,
  updates: Partial<Pick<List, 'name' | 'is_shared' | 'share_token'>>
): Promise<void> {
  await setDoc(
    doc(db, 'lists', listId),
    {
      ...updates,
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteList(listId: string, userId: string): Promise<void> {
  const listProductsSnap = await getDocs(
    query(
      collection(db, 'list_products'),
      where('list_id', '==', listId),
      where('user_id', '==', userId)
    )
  );
  const batch = writeBatch(db);
  listProductsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'lists', listId));
  await batch.commit();
}

/**
 * Rows linking products to a list. Pass `userId` whenever the caller knows the owner uid
 * (signed-in user’s lists) so Firestore rules can match `where('user_id', '==', uid)` on queries.
 * For public shared lists, pass `listOwnerUserId` from the list document (see getListWithProductsByShareToken).
 */
export async function getListProductRows(
  listId: string,
  userId?: string | null
): Promise<ListProduct[]> {
  const parts = [where('list_id', '==', listId)];
  if (userId != null && userId !== '') parts.push(where('user_id', '==', userId));
  const snap = await getDocs(query(collection(db, 'list_products'), ...parts));
  return snap.docs.map((d) => mapListProduct(d.id, d.data()));
}

export async function getProductListRows(
  productId: string,
  userId: string
): Promise<ListProduct[]> {
  const snap = await getDocs(
    query(
      collection(db, 'list_products'),
      where('product_id', '==', productId),
      where('user_id', '==', userId)
    )
  );
  return snap.docs.map((d) => mapListProduct(d.id, d.data()));
}

export async function addProductToList(params: {
  user_id: string;
  list_id: string;
  product_id: string;
}): Promise<void> {
  const existing = await getListProductRows(params.list_id, params.user_id);
  if (existing.some((row) => row.product_id === params.product_id)) return;
  await addDoc(collection(db, 'list_products'), {
    ...params,
    added_at: serverTimestamp(),
  });
}

export async function addProductToLists(params: {
  user_id: string;
  list_ids: string[];
  product_id: string;
}): Promise<void> {
  for (const listId of params.list_ids) {
    await addProductToList({
      user_id: params.user_id,
      list_id: listId,
      product_id: params.product_id,
    });
  }
}

export async function removeProductFromList(params: {
  user_id: string;
  list_id: string;
  product_id: string;
}): Promise<void> {
  const rows = await getListProductRows(params.list_id, params.user_id);
  const batch = writeBatch(db);
  rows
    .filter((row) => row.product_id === params.product_id)
    .forEach((row) => batch.delete(doc(db, 'list_products', row.id)));
  await batch.commit();
}

export async function getProductsByIds(productIds: string[]): Promise<Product[]> {
  if (productIds.length === 0) return [];
  const ids = Array.from(new Set(productIds));
  const snaps = await Promise.all(ids.map((id) => getDoc(doc(db, 'products', id))));
  return snaps.filter((s) => s.exists()).map((s) => mapProduct(s.id, s.data() as DocumentData));
}

export async function getUserListsWithProducts(
  userId: string
): Promise<Array<List & { products: Product[] }>> {
  const lists = await getUserLists(userId);
  const rows = await getDocs(query(collection(db, 'list_products'), where('user_id', '==', userId)));
  const byList = new Map<string, string[]>();
  rows.docs.forEach((d) => {
    const row = d.data();
    const listId = row.list_id as string;
    const productId = row.product_id as string;
    byList.set(listId, [...(byList.get(listId) ?? []), productId]);
  });

  const productIds = rows.docs.map((d) => d.data().product_id as string);
  const products = await getProductsByIds(productIds);
  const productsById = new Map(products.map((p) => [p.id, p]));

  return lists.map((list) => ({
    ...list,
    products: (byList.get(list.id) ?? [])
      .map((productId) => productsById.get(productId))
      .filter((p): p is Product => Boolean(p)),
  }));
}

export async function getListByShareToken(shareToken: string): Promise<List | null> {
  const token = normalizeShareToken(shareToken);
  if (!token) return null;
  // Require is_shared in the query so anonymous reads satisfy security rules (lists are
  // created with share_token but is_shared false until the owner shares).
  const snap = await getDocs(
    query(
      collection(db, 'lists'),
      where('share_token', '==', token),
      where('is_shared', '==', true)
    )
  );
  if (snap.empty) return null;
  return mapList(snap.docs[0].id, snap.docs[0].data());
}

export async function getListWithProductsByShareToken(
  shareToken: string
): Promise<{ list: List; products: Product[] } | null> {
  const list = await getListByShareToken(shareToken);
  if (!list) return null;
  const rows = await getListProductRows(list.id, list.user_id);
  const products = await getProductsByIds(rows.map((r) => r.product_id));
  return { list, products };
}

export async function getProductById(productId: string): Promise<Product | null> {
  const snap = await getDoc(doc(db, 'products', productId));
  if (!snap.exists()) return null;
  return mapProduct(snap.id, snap.data());
}

export async function getUserNotifications(userId: string): Promise<Notification[]> {
  const snap = await getDocs(query(collection(db, 'notifications'), where('user_id', '==', userId)));
  return snap.docs
    .map((d) => mapNotification(d.id, d.data()))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 30);
}

export async function createNotifications(
  notifications: Array<Omit<Notification, 'id' | 'is_read' | 'created_at'>>
): Promise<void> {
  if (notifications.length === 0) return;
  const batch = writeBatch(db);
  notifications.forEach((notification) => {
    const ref = doc(collection(db, 'notifications'));
    batch.set(ref, {
      ...notification,
      is_read: false,
      created_at: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function markNotificationsRead(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  const batch = writeBatch(db);
  notificationIds.forEach((id) => {
    batch.set(
      doc(db, 'notifications', id),
      {
        is_read: true,
      },
      { merge: true }
    );
  });
  await batch.commit();
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await deleteDoc(doc(db, 'notifications', notificationId));
}

export async function deleteNotifications(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  const batch = writeBatch(db);
  notificationIds.forEach((id) => batch.delete(doc(db, 'notifications', id)));
  await batch.commit();
}

export function subscribeToNotifications(
  userId: string,
  callback: (notifications: Notification[]) => void
): () => void {
  const q = query(collection(db, 'notifications'), where('user_id', '==', userId));
  return onSnapshot(q, (snap) => {
    const notifications = snap.docs
      .map((d) => mapNotification(d.id, d.data()))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 30);
    callback(notifications);
  });
}

export async function deleteAllUserData(userId: string): Promise<void> {
  const [productsSnap, listsSnap, listProductsSnap, notificationsSnap] = await Promise.all([
    getDocs(query(collection(db, 'products'), where('user_id', '==', userId))),
    getDocs(query(collection(db, 'lists'), where('user_id', '==', userId))),
    getDocs(query(collection(db, 'list_products'), where('user_id', '==', userId))),
    getDocs(query(collection(db, 'notifications'), where('user_id', '==', userId))),
  ]);

  const batch = writeBatch(db);
  productsSnap.docs.forEach((d) => batch.delete(d.ref));
  listsSnap.docs.forEach((d) => batch.delete(d.ref));
  listProductsSnap.docs.forEach((d) => batch.delete(d.ref));
  notificationsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'profiles', userId));
  await batch.commit();
}

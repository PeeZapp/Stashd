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
import { db, auth } from './firebase';
import { isFirestorePermissionDenied, withFirestoreAuth } from './firestoreAuth';
import { normalizeShareToken } from './shareLink';
import type {
  List,
  ListScope,
  ListProduct,
  Notification,
  Outfit,
  OutfitProduct,
  PriceSource,
  Product,
  Profile,
  StandardList,
  StandardListComment,
  StandardListItem,
  SavedLink,
  SavedLinkCollection,
  SavedLinkMetadata,
  SavedLinkPriority,
  SavedLinkStatus,
  SavedLinkTimestampNote,
  SavedLinkType,
} from './types';

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
  const hourRaw = data.detailed_enrichment_schedule_hour;
  const hourOk =
    typeof hourRaw === 'number' && Number.isInteger(hourRaw) && hourRaw >= 0 && hourRaw <= 23;
  return {
    id,
    name: (data.name as string) ?? '',
    email: (data.email as string) ?? '',
    created_at: asIso(data.created_at),
    updated_at: asIso(data.updated_at),
    detailed_enrichment_schedule_hour: hourOk ? hourRaw : null,
    detailed_enrichment_when_idle: Boolean(data.detailed_enrichment_when_idle),
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
    add_detail_level: data.add_detail_level === 'quick' ? 'quick' : 'detailed',
    detailed_enrichment_pending: data.detailed_enrichment_pending === true,
    created_at: asIso(data.created_at),
    updated_at: asIso(data.updated_at),
  };
}

function mapList(id: string, data: DocumentData): List {
  const rawScope = data.scope as string | undefined;
  const scope: ListScope = rawScope === 'stash' ? 'stash' : 'wishlist';
  const parentListId = data.parent_list_id as string | null | undefined;
  return {
    id,
    user_id: data.user_id as string,
    name: (data.name as string) ?? '',
    scope,
    parent_list_id: parentListId ?? null,
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

function mapStandardListPriority(value: unknown): StandardListItem['priority'] {
  const n = typeof value === 'number' ? value : 0;
  if (n >= 1 && n <= 4) return n as StandardListItem['priority'];
  return 0;
}

function mapStandardList(id: string, data: DocumentData): StandardList {
  const collaboratorEmails = data.collaborator_emails;
  return {
    id,
    user_id: data.user_id as string,
    name: (data.name as string) ?? '',
    description: (data.description as string | null) ?? null,
    is_pinned: Boolean(data.is_pinned),
    is_shared: Boolean(data.is_shared),
    share_token: (data.share_token as string | null) ?? null,
    collaborator_emails: Array.isArray(collaboratorEmails)
      ? (collaboratorEmails as string[])
          .filter((email) => typeof email === 'string')
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean)
      : [],
    created_at: asIso(data.created_at),
    updated_at: asIso(data.updated_at),
  };
}

function mapStandardListItem(id: string, data: DocumentData): StandardListItem {
  const tagsRaw = data.tags;
  const tags = Array.isArray(tagsRaw)
    ? (tagsRaw as string[]).filter((t) => typeof t === 'string').map((t) => t.toLowerCase())
    : [];
  const imageUrlsRaw = data.image_urls;
  const image_urls = Array.isArray(imageUrlsRaw)
    ? (imageUrlsRaw as string[]).filter((url) => typeof url === 'string')
    : [];
  return {
    id,
    user_id: data.user_id as string,
    list_id: data.list_id as string,
    parent_id: (data.parent_id as string | null) ?? null,
    text: (data.text as string) ?? '',
    notes: (data.notes as string | null) ?? null,
    tags,
    priority: mapStandardListPriority(data.priority),
    due_at: data.due_at ? asIso(data.due_at) : null,
    recurrence: data.recurrence === 'daily' || data.recurrence === 'weekly' || data.recurrence === 'monthly'
      ? data.recurrence
      : 'none',
    link_url: (data.link_url as string | null) ?? null,
    link_title: (data.link_title as string | null) ?? null,
    product_id: (data.product_id as string | null) ?? null,
    image_urls,
    is_completed: Boolean(data.is_completed),
    position: typeof data.position === 'number' ? data.position : 0,
    created_at: asIso(data.created_at),
    updated_at: asIso(data.updated_at),
  };
}

function mapStandardListComment(id: string, data: DocumentData): StandardListComment {
  return {
    id,
    list_id: data.list_id as string,
    item_id: data.item_id as string,
    user_id: data.user_id as string,
    author_name: (data.author_name as string) ?? 'Someone',
    body: (data.body as string) ?? '',
    created_at: asIso(data.created_at),
  };
}

const SAVED_LINK_TYPES: SavedLinkType[] = [
  'recipe',
  'video',
  'article',
  'tool',
  'place',
  'product',
  'other',
];

const SAVED_LINK_STATUSES: SavedLinkStatus[] = [
  'saved',
  'try_next',
  'tried',
  'liked',
  'not_for_me',
  'archived',
];

function mapSavedLinkPriority(value: unknown): SavedLinkPriority {
  const n = typeof value === 'number' ? value : 0;
  if (n >= 1 && n <= 4) return n as SavedLinkPriority;
  return 0;
}

function mapSavedLinkType(value: unknown): SavedLinkType {
  return SAVED_LINK_TYPES.includes(value as SavedLinkType) ? (value as SavedLinkType) : 'other';
}

function mapSavedLinkStatus(value: unknown): SavedLinkStatus {
  return SAVED_LINK_STATUSES.includes(value as SavedLinkStatus)
    ? (value as SavedLinkStatus)
    : 'saved';
}

function mapSavedLinkMetadata(data: unknown): SavedLinkMetadata {
  if (!data || typeof data !== 'object') return {};
  const raw = data as Record<string, unknown>;
  const ingredients = raw.ingredients;
  const diet_tags = raw.diet_tags;
  const metadata: SavedLinkMetadata = {};
  if (Array.isArray(ingredients)) {
    metadata.ingredients = (ingredients as string[]).filter((x) => typeof x === 'string');
  }
  if (typeof raw.cook_time_minutes === 'number') metadata.cook_time_minutes = raw.cook_time_minutes;
  if (typeof raw.total_time_minutes === 'number') metadata.total_time_minutes = raw.total_time_minutes;
  if (typeof raw.servings === 'string') metadata.servings = raw.servings;
  if (typeof raw.cuisine === 'string') metadata.cuisine = raw.cuisine;
  if (Array.isArray(diet_tags)) {
    metadata.diet_tags = (diet_tags as string[]).filter((x) => typeof x === 'string');
  }
  if (typeof raw.creator === 'string') metadata.creator = raw.creator;
  if (typeof raw.duration === 'string') metadata.duration = raw.duration;
  if (typeof raw.platform === 'string') metadata.platform = raw.platform;
  if (typeof raw.embed_url === 'string') metadata.embed_url = raw.embed_url;
  if (typeof raw.author === 'string') metadata.author = raw.author;
  if (typeof raw.published_at === 'string') metadata.published_at = raw.published_at;
  return metadata;
}

/** Firestore rejects `undefined`; strip it from nested objects before writes. */
function isFirestoreFieldValue(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_methodName' in (value as Record<string, unknown>)
  );
}

function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) return value;
  if (isFirestoreFieldValue(value)) return value;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) =>
      item !== null && typeof item === 'object' ? sanitizeForFirestore(item) : item
    ) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry !== undefined) out[key] = sanitizeForFirestore(entry);
  }
  return out as T;
}

function authAddDoc(...args: Parameters<typeof addDoc>) {
  return withFirestoreAuth(() => addDoc(...args));
}

function authSetDoc(...args: Parameters<typeof setDoc>) {
  return withFirestoreAuth(() => setDoc(...args));
}

function authDeleteDoc(...args: Parameters<typeof deleteDoc>) {
  return withFirestoreAuth(() => deleteDoc(...args));
}

function authBatchCommit(batch: ReturnType<typeof writeBatch>) {
  return withFirestoreAuth(() => batch.commit());
}

function mapSavedLinkCollection(id: string, data: DocumentData): SavedLinkCollection {
  return {
    id,
    user_id: data.user_id as string,
    name: (data.name as string) ?? '',
    description: (data.description as string | null) ?? null,
    color: (data.color as string | null) ?? null,
    icon: (data.icon as string | null) ?? null,
    position: typeof data.position === 'number' ? data.position : 0,
    created_at: asIso(data.created_at),
    updated_at: asIso(data.updated_at),
  };
}

function mapSavedLinkTimestampNotes(value: unknown): SavedLinkTimestampNote[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
      label: typeof item.label === 'string' ? item.label : '',
      timecode: typeof item.timecode === 'string' ? item.timecode : '',
      seconds: typeof item.seconds === 'number' ? item.seconds : null,
      note: typeof item.note === 'string' ? item.note : '',
      created_at: typeof item.created_at === 'string' ? item.created_at : nowIso(),
    }))
    .filter((item) => item.timecode || item.note);
}

function mapSavedLink(id: string, data: DocumentData): SavedLink {
  const collectionIds = data.collection_ids;
  const tagsRaw = data.tags;
  return {
    id,
    user_id: data.user_id as string,
    collection_ids: Array.isArray(collectionIds)
      ? (collectionIds as string[]).filter((id) => typeof id === 'string')
      : [],
    url: (data.url as string) ?? '',
    canonical_url: (data.canonical_url as string) ?? (data.url as string) ?? '',
    title: (data.title as string) ?? '',
    description: (data.description as string | null) ?? null,
    image_url: (data.image_url as string | null) ?? null,
    site_name: (data.site_name as string | null) ?? null,
    favicon_url: (data.favicon_url as string | null) ?? null,
    link_type: mapSavedLinkType(data.link_type),
    status: mapSavedLinkStatus(data.status),
    priority: mapSavedLinkPriority(data.priority),
    tags: Array.isArray(tagsRaw)
      ? (tagsRaw as string[]).filter((t) => typeof t === 'string').map((t) => t.toLowerCase())
      : [],
    notes: (data.notes as string | null) ?? null,
    timestamp_notes: mapSavedLinkTimestampNotes(data.timestamp_notes),
    metadata: mapSavedLinkMetadata(data.metadata),
    enrichment_pending: Boolean(data.enrichment_pending),
    created_at: asIso(data.created_at),
    updated_at: asIso(data.updated_at),
  };
}

function mapOutfit(id: string, data: DocumentData): Outfit {
  const urls = data.image_urls;
  return {
    id,
    user_id: data.user_id as string,
    name: (data.name as string) ?? '',
    image_urls: Array.isArray(urls) ? (urls as string[]).filter((u) => typeof u === 'string') : [],
    created_at: asIso(data.created_at),
    updated_at: asIso(data.updated_at),
  };
}

function mapOutfitProduct(id: string, data: DocumentData): OutfitProduct {
  return {
    id,
    user_id: data.user_id as string,
    outfit_id: data.outfit_id as string,
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
  await authSetDoc(
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
  await authSetDoc(
    ref,
    {
      name,
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function updateProfileDetailedAddSettings(
  userId: string,
  settings: {
    detailed_enrichment_schedule_hour: number | null;
    detailed_enrichment_when_idle: boolean;
  }
): Promise<void> {
  const ref = doc(db, 'profiles', userId);
  await authSetDoc(
    ref,
    {
      ...settings,
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function createProduct(
  payload: Omit<Product, 'id' | 'created_at' | 'updated_at'>
): Promise<Product> {
  return withFirestoreAuth(async () => {
    const uid = auth.currentUser!.uid;
    const ref = await addDoc(collection(db, 'products'), {
      user_id: uid,
      title: payload.title,
      current_price: payload.current_price ?? null,
      original_price: payload.original_price ?? null,
      is_on_sale: Boolean(payload.is_on_sale),
      image_url: payload.image_url ?? null,
      source_url: payload.source_url,
      store_name: payload.store_name ?? null,
      description: payload.description ?? null,
      sku: payload.sku ?? null,
      price_source: payload.price_source ?? null,
      is_owned: Boolean(payload.is_owned),
      add_detail_level: payload.add_detail_level,
      detailed_enrichment_pending: Boolean(payload.detailed_enrichment_pending),
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    const snap = await getDoc(ref);
    return mapProduct(snap.id, snap.data() ?? payload);
  });
}

export async function updateProduct(
  productId: string,
  updates: Partial<Omit<Product, 'id' | 'created_at' | 'updated_at' | 'user_id'>>
): Promise<Product | null> {
  const ref = doc(db, 'products', productId);
  await authSetDoc(
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
  await authBatchCommit(batch);
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
  scope?: ListScope;
  parent_list_id?: string | null;
}): Promise<List> {
  return withFirestoreAuth(async () => {
    const uid = auth.currentUser!.uid;
    let scope: ListScope = params.scope ?? 'wishlist';
    let parentListId: string | null = params.parent_list_id ?? null;

    if (parentListId) {
      const parentSnap = await getDoc(doc(db, 'lists', parentListId));
      if (!parentSnap.exists()) {
        throw new Error('That parent list no longer exists. Refresh and try again.');
      }
      const parent = mapList(parentSnap.id, parentSnap.data() as DocumentData);
      if (parent.user_id !== uid) {
        throw new Error('You can only add sub-lists to your own lists.');
      }
      if (parent.parent_list_id) {
        throw new Error('Sub-lists cannot be nested further — create them under the main list.');
      }
      scope = parent.scope;
      parentListId = parent.id;
    }

    const ref = await addDoc(collection(db, 'lists'), {
      user_id: uid,
      name: params.name,
      share_token: params.share_token ?? null,
      scope,
      parent_list_id: parentListId,
      is_shared: false,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    const snap = await getDoc(ref);
    return mapList(snap.id, snap.data() ?? params);
  });
}

export async function updateList(
  listId: string,
  updates: Partial<Pick<List, 'name' | 'is_shared' | 'share_token'>>
): Promise<void> {
  await authSetDoc(
    doc(db, 'lists', listId),
    {
      ...updates,
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteList(listId: string, userId: string): Promise<void> {
  const allLists = await getUserLists(userId);
  const toDelete = new Set<string>([listId]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const list of allLists) {
      if (list.parent_list_id && toDelete.has(list.parent_list_id) && !toDelete.has(list.id)) {
        toDelete.add(list.id);
        expanded = true;
      }
    }
  }

  const batch = writeBatch(db);
  for (const id of toDelete) {
    const rows = await getListProductRows(id, userId);
    rows.forEach((row) => batch.delete(doc(db, 'list_products', row.id)));
    batch.delete(doc(db, 'lists', id));
  }
  await authBatchCommit(batch);
}

const FIRESTORE_BATCH_LIMIT = 450;

async function deleteDocsInBatches(refs: ReturnType<typeof doc>[]): Promise<void> {
  for (let i = 0; i < refs.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    refs.slice(i, i + FIRESTORE_BATCH_LIMIT).forEach((ref) => batch.delete(ref));
    await authBatchCommit(batch);
  }
}

/** Deletes wishlist/stash lists and their list_products rows. Products are kept. */
export async function deleteAllProductLists(userId: string): Promise<{ lists: number; links: number }> {
  return withFirestoreAuth(async () => {
    const [listsSnap, linksSnap] = await Promise.all([
      getDocs(query(collection(db, 'lists'), where('user_id', '==', userId))),
      getDocs(query(collection(db, 'list_products'), where('user_id', '==', userId))),
    ]);
    const linkRefs = linksSnap.docs.map((d) => d.ref);
    const listRefs = listsSnap.docs.map((d) => d.ref);
    await deleteDocsInBatches([...linkRefs, ...listRefs]);
    return { lists: listRefs.length, links: linkRefs.length };
  });
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
  // Query by user_id only, then filter by list_id in memory. Compound list_id+user_id
  // queries can fail security rules even when single-field queries succeed.
  if (userId != null && userId !== '') {
    const snap = await getDocs(
      query(collection(db, 'list_products'), where('user_id', '==', userId))
    );
    return snap.docs
      .map((d) => mapListProduct(d.id, d.data()))
      .filter((row) => row.list_id === listId);
  }
  const snap = await getDocs(
    query(collection(db, 'list_products'), where('list_id', '==', listId))
  );
  return snap.docs.map((d) => mapListProduct(d.id, d.data()));
}

export async function getProductListRows(
  productId: string,
  userId: string
): Promise<ListProduct[]> {
  const snap = await getDocs(
    query(collection(db, 'list_products'), where('user_id', '==', userId))
  );
  return snap.docs
    .map((d) => mapListProduct(d.id, d.data()))
    .filter((row) => row.product_id === productId);
}

export async function addProductToList(params: {
  user_id: string;
  list_id: string;
  product_id: string;
}): Promise<void> {
  return withFirestoreAuth(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('You must be signed in to save.');

    const [listSnap, productSnap] = await Promise.all([
      getDoc(doc(db, 'lists', params.list_id)),
      getDoc(doc(db, 'products', params.product_id)),
    ]);
    if (!listSnap.exists()) {
      throw new Error('That list no longer exists. Refresh the page and try again.');
    }
    if (!productSnap.exists()) {
      throw new Error('That product could not be found. Try saving again.');
    }
    const list = mapList(listSnap.id, listSnap.data() as DocumentData);
    const product = mapProduct(productSnap.id, productSnap.data() as DocumentData);
    if (list.user_id !== uid) {
      throw new Error('You can only add items to your own lists.');
    }
    if (product.user_id !== uid) {
      throw new Error(
        'This product belongs to a different account. Sign out and sign in again, then retry.'
      );
    }
    if (list.scope === 'stash' && !product.is_owned) {
      throw new Error(
        'Stash lists are for things you own. Mark this item as owned first, or add it to a wishlist.'
      );
    }
    try {
      const existing = await getListProductRows(params.list_id, uid);
      if (existing.some((row) => row.product_id === params.product_id)) return;
    } catch (err) {
      if (!isFirestorePermissionDenied(err)) throw err;
      // Legacy list_products rows can block the read query; still try to link the product.
    }
    try {
      await authAddDoc(collection(db, 'list_products'), {
        user_id: uid,
        list_id: params.list_id,
        product_id: params.product_id,
        added_at: serverTimestamp(),
      });
    } catch (err) {
      if (isFirestorePermissionDenied(err)) {
        throw new Error(
          `Could not link product to "${list.name}". ` +
            `This often happens with lists created before a schema update — ` +
            `run \`await resetWishlists()\` in the browser console to wipe wishlists and start fresh.`
        );
      }
      throw err;
    }
  });
}

export async function addProductToLists(params: {
  user_id: string;
  list_ids: string[];
  product_id: string;
}): Promise<void> {
  const listIds = [...new Set(params.list_ids)].filter(Boolean);
  for (const listId of listIds) {
    try {
      await addProductToList({
        user_id: params.user_id,
        list_id: listId,
        product_id: params.product_id,
      });
    } catch (err) {
      let listLabel = listId;
      try {
        const snap = await getDoc(doc(db, 'lists', listId));
        if (snap.exists()) {
          const list = mapList(snap.id, snap.data() as DocumentData);
          listLabel = `"${list.name}" (${list.scope})`;
        }
      } catch {
        // ignore — use raw id
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not add to list ${listLabel}: ${message}`);
    }
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
  await authBatchCommit(batch);
}

export async function getProductsByIds(productIds: string[]): Promise<Product[]> {
  if (productIds.length === 0) return [];
  const ids = Array.from(new Set(productIds));
  const snaps = await Promise.all(ids.map((id) => getDoc(doc(db, 'products', id))));
  return snaps.filter((s) => s.exists()).map((s) => mapProduct(s.id, s.data() as DocumentData));
}

export async function getUserProducts(userId: string): Promise<Product[]> {
  const snap = await getDocs(query(collection(db, 'products'), where('user_id', '==', userId)));
  return snap.docs
    .map((d) => mapProduct(d.id, d.data()))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/** Products saved to your account that are not linked to any wishlist/stash list. */
export async function getUnlistedProducts(userId: string): Promise<Product[]> {
  const [products, linksSnap] = await Promise.all([
    getUserProducts(userId),
    getDocs(query(collection(db, 'list_products'), where('user_id', '==', userId))),
  ]);
  const linkedIds = new Set(linksSnap.docs.map((d) => d.data().product_id as string));
  return products.filter((p) => !linkedIds.has(p.id));
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

export async function getUserStandardLists(userId: string, userEmail?: string | null): Promise<StandardList[]> {
  const ownedSnap = await getDocs(query(collection(db, 'standard_lists'), where('user_id', '==', userId)));
  const lists = ownedSnap.docs.map((d) => mapStandardList(d.id, d.data()));

  const email = userEmail?.trim().toLowerCase();
  if (email) {
    const sharedSnap = await getDocs(
      query(collection(db, 'standard_lists'), where('collaborator_emails', 'array-contains', email))
    );
    sharedSnap.docs.forEach((d) => {
      if (!lists.some((list) => list.id === d.id)) lists.push(mapStandardList(d.id, d.data()));
    });
  }

  return lists
    .sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
}

export async function createStandardList(params: {
  user_id: string;
  name: string;
  description?: string | null;
  is_pinned?: boolean;
  is_shared?: boolean;
  share_token?: string | null;
  collaborator_emails?: string[];
}): Promise<StandardList> {
  const ref = await authAddDoc(collection(db, 'standard_lists'), {
    user_id: params.user_id,
    name: params.name,
    description: params.description ?? null,
    is_pinned: Boolean(params.is_pinned),
    is_shared: Boolean(params.is_shared),
    share_token: params.share_token ?? null,
    collaborator_emails: params.collaborator_emails ?? [],
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
  const snap = await getDoc(ref);
  return mapStandardList(snap.id, snap.data() ?? params);
}

export async function createStandardListWithItems(params: {
  user_id: string;
  name: string;
  description?: string | null;
  itemTexts: string[];
}): Promise<{ list: StandardList; items: StandardListItem[] }> {
  const list = await createStandardList({
    user_id: params.user_id,
    name: params.name,
    description: params.description ?? null,
  });
  const items: StandardListItem[] = [];
  for (let i = 0; i < params.itemTexts.length; i++) {
    const text = params.itemTexts[i]?.trim();
    if (!text) continue;
    const item = await createStandardListItem({
      user_id: params.user_id,
      list_id: list.id,
      text,
      position: i,
    });
    items.push(item);
  }
  return { list, items };
}

export async function updateStandardList(
  listId: string,
  updates: Partial<
    Pick<
      StandardList,
      'name' | 'description' | 'is_pinned' | 'is_shared' | 'share_token' | 'collaborator_emails'
    >
  >
): Promise<void> {
  await authSetDoc(
    doc(db, 'standard_lists', listId),
    {
      ...updates,
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteStandardList(listId: string, userId: string): Promise<void> {
  const [itemsSnap, commentsSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'standard_list_items'),
        where('list_id', '==', listId),
        where('user_id', '==', userId)
      )
    ),
    getDocs(query(collection(db, 'standard_list_comments'), where('list_id', '==', listId))),
  ]);
  const batch = writeBatch(db);
  itemsSnap.docs.forEach((d) => batch.delete(d.ref));
  commentsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'standard_lists', listId));
  await authBatchCommit(batch);
}

export async function getStandardListItems(
  listId: string,
  userId: string
): Promise<StandardListItem[]> {
  const snap = await getDocs(
    query(
      collection(db, 'standard_list_items'),
      where('list_id', '==', listId),
      where('user_id', '==', userId)
    )
  );
  return snap.docs
    .map((d) => mapStandardListItem(d.id, d.data()))
    .sort((a, b) => a.position - b.position || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export async function getAllStandardListItemsForUser(userId: string): Promise<StandardListItem[]> {
  const snap = await getDocs(
    query(collection(db, 'standard_list_items'), where('user_id', '==', userId))
  );
  return snap.docs.map((d) => mapStandardListItem(d.id, d.data()));
}

export async function createStandardListItem(params: {
  user_id: string;
  list_id: string;
  text: string;
  position: number;
  parent_id?: string | null;
  notes?: string | null;
  tags?: string[];
  priority?: StandardListItem['priority'];
  due_at?: string | null;
  recurrence?: StandardListItem['recurrence'];
  link_url?: string | null;
  link_title?: string | null;
  product_id?: string | null;
  image_urls?: string[];
}): Promise<StandardListItem> {
  const ref = await authAddDoc(collection(db, 'standard_list_items'), {
    user_id: params.user_id,
    list_id: params.list_id,
    parent_id: params.parent_id ?? null,
    text: params.text,
    notes: params.notes ?? null,
    tags: params.tags ?? [],
    priority: params.priority ?? 0,
    due_at: params.due_at ?? null,
    recurrence: params.recurrence ?? 'none',
    link_url: params.link_url ?? null,
    link_title: params.link_title ?? null,
    product_id: params.product_id ?? null,
    image_urls: params.image_urls ?? [],
    position: params.position,
    is_completed: false,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
  await authSetDoc(
    doc(db, 'standard_lists', params.list_id),
    { updated_at: serverTimestamp() },
    { merge: true }
  );
  const snap = await getDoc(ref);
  return mapStandardListItem(snap.id, snap.data() ?? params);
}

export async function updateStandardListItem(
  itemId: string,
  updates: Partial<
    Pick<
      StandardListItem,
      | 'text'
      | 'is_completed'
      | 'position'
      | 'parent_id'
      | 'notes'
      | 'tags'
      | 'priority'
      | 'due_at'
      | 'recurrence'
      | 'link_url'
      | 'link_title'
      | 'product_id'
      | 'image_urls'
    >
  >
): Promise<void> {
  const payload: Record<string, unknown> = { ...updates, updated_at: serverTimestamp() };
  await authSetDoc(doc(db, 'standard_list_items', itemId), payload, { merge: true });
}

export async function reorderStandardListItems(
  updates: Array<{ id: string; position: number }>
): Promise<void> {
  if (updates.length === 0) return;
  const batch = writeBatch(db);
  updates.forEach(({ id, position }) => {
    batch.set(
      doc(db, 'standard_list_items', id),
      { position, updated_at: serverTimestamp() },
      { merge: true }
    );
  });
  await authBatchCommit(batch);
}

export async function deleteStandardListItem(itemId: string, listId: string): Promise<void> {
  const [all, commentsSnap] = await Promise.all([
    getDocs(query(collection(db, 'standard_list_items'), where('list_id', '==', listId))),
    getDocs(query(collection(db, 'standard_list_comments'), where('list_id', '==', listId))),
  ]);
  const batch = writeBatch(db);
  const toDelete = new Set<string>([itemId]);
  let changed = true;
  while (changed) {
    changed = false;
    all.docs.forEach((d) => {
      const data = d.data();
      if (data.parent_id && toDelete.has(data.parent_id as string) && !toDelete.has(d.id)) {
        toDelete.add(d.id);
        changed = true;
      }
    });
  }
  toDelete.forEach((id) => batch.delete(doc(db, 'standard_list_items', id)));
  commentsSnap.docs
    .filter((d) => toDelete.has(d.data().item_id as string))
    .forEach((d) => batch.delete(d.ref));
  await authBatchCommit(batch);
}

export async function getStandardListComments(listId: string): Promise<StandardListComment[]> {
  const snap = await getDocs(
    query(collection(db, 'standard_list_comments'), where('list_id', '==', listId))
  );
  return snap.docs
    .map((d) => mapStandardListComment(d.id, d.data()))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export async function createStandardListComment(params: {
  list_id: string;
  item_id: string;
  user_id: string;
  author_name: string;
  body: string;
}): Promise<StandardListComment> {
  const ref = await authAddDoc(collection(db, 'standard_list_comments'), {
    ...params,
    created_at: serverTimestamp(),
  });
  const snap = await getDoc(ref);
  return mapStandardListComment(snap.id, snap.data() ?? params);
}

export async function deleteStandardListComment(commentId: string): Promise<void> {
  await authDeleteDoc(doc(db, 'standard_list_comments', commentId));
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
  await authBatchCommit(batch);
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
  await authBatchCommit(batch);
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await authDeleteDoc(doc(db, 'notifications', notificationId));
}

export async function deleteNotifications(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  const batch = writeBatch(db);
  notificationIds.forEach((id) => batch.delete(doc(db, 'notifications', id)));
  await authBatchCommit(batch);
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

// ── Outfits (curated looks: links to owned stash products + user photos; deleteOutfit does not delete products) ──

export async function getUserOutfits(userId: string): Promise<Outfit[]> {
  const snap = await getDocs(query(collection(db, 'outfits'), where('user_id', '==', userId)));
  return snap.docs
    .map((d) => mapOutfit(d.id, d.data()))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export async function createOutfit(params: { user_id: string; name: string }): Promise<Outfit> {
  const ref = await authAddDoc(collection(db, 'outfits'), {
    user_id: params.user_id,
    name: params.name,
    image_urls: [],
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
  const snap = await getDoc(ref);
  return mapOutfit(snap.id, snap.data() ?? params);
}

export async function updateOutfit(
  outfitId: string,
  updates: Partial<Pick<Outfit, 'name' | 'image_urls'>>
): Promise<void> {
  await authSetDoc(
    doc(db, 'outfits', outfitId),
    {
      ...updates,
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteOutfit(outfitId: string, userId: string): Promise<void> {
  const rowsSnap = await getDocs(
    query(
      collection(db, 'outfit_products'),
      where('outfit_id', '==', outfitId),
      where('user_id', '==', userId)
    )
  );
  const batch = writeBatch(db);
  rowsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'outfits', outfitId));
  await authBatchCommit(batch);
}

export async function getOutfitProductRows(outfitId: string, userId: string): Promise<OutfitProduct[]> {
  const snap = await getDocs(
    query(
      collection(db, 'outfit_products'),
      where('outfit_id', '==', outfitId),
      where('user_id', '==', userId)
    )
  );
  return snap.docs.map((d) => mapOutfitProduct(d.id, d.data()));
}

export async function addProductToOutfit(params: {
  user_id: string;
  outfit_id: string;
  product_id: string;
}): Promise<void> {
  const existing = await getOutfitProductRows(params.outfit_id, params.user_id);
  if (existing.some((row) => row.product_id === params.product_id)) return;
  await authAddDoc(collection(db, 'outfit_products'), {
    ...params,
    added_at: serverTimestamp(),
  });
}

export async function removeProductFromOutfit(params: {
  user_id: string;
  outfit_id: string;
  product_id: string;
}): Promise<void> {
  const rows = await getOutfitProductRows(params.outfit_id, params.user_id);
  const batch = writeBatch(db);
  rows
    .filter((row) => row.product_id === params.product_id)
    .forEach((row) => batch.delete(doc(db, 'outfit_products', row.id)));
  await authBatchCommit(batch);
}

export async function getUserOutfitsWithProducts(userId: string): Promise<
  Array<{ outfit: Outfit; products: Product[] }>
> {
  const outfits = await getUserOutfits(userId);
  if (outfits.length === 0) return [];
  const rowsSnap = await getDocs(
    query(collection(db, 'outfit_products'), where('user_id', '==', userId))
  );
  const byOutfit = new Map<string, string[]>();
  rowsSnap.docs.forEach((d) => {
    const row = d.data();
    const oid = row.outfit_id as string;
    const pid = row.product_id as string;
    byOutfit.set(oid, [...(byOutfit.get(oid) ?? []), pid]);
  });
  const productIds = [...new Set(rowsSnap.docs.map((d) => d.data().product_id as string))];
  const products = await getProductsByIds(productIds);
  const productsById = new Map(products.map((p) => [p.id, p]));
  return outfits.map((outfit) => ({
    outfit,
    products: (byOutfit.get(outfit.id) ?? [])
      .map((id) => productsById.get(id))
      .filter((p): p is Product => Boolean(p)),
  }));
}

// ── Saved links (URL library) ───────────────────────────────

export async function getUserSavedLinkCollections(userId: string): Promise<SavedLinkCollection[]> {
  const snap = await getDocs(
    query(collection(db, 'saved_link_collections'), where('user_id', '==', userId))
  );
  return snap.docs
    .map((d) => mapSavedLinkCollection(d.id, d.data()))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

export async function createSavedLinkCollection(params: {
  user_id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  position?: number;
}): Promise<SavedLinkCollection> {
  const ref = await authAddDoc(collection(db, 'saved_link_collections'), {
    user_id: params.user_id,
    name: params.name.trim(),
    description: params.description ?? null,
    color: params.color ?? null,
    icon: params.icon ?? null,
    position: params.position ?? 0,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
  const snap = await getDoc(ref);
  return mapSavedLinkCollection(snap.id, snap.data() ?? params);
}

export async function updateSavedLinkCollection(
  collectionId: string,
  updates: Partial<Pick<SavedLinkCollection, 'name' | 'description' | 'color' | 'icon' | 'position'>>
): Promise<void> {
  await authSetDoc(
    doc(db, 'saved_link_collections', collectionId),
    { ...updates, updated_at: serverTimestamp() },
    { merge: true }
  );
}

export async function deleteSavedLinkCollection(collectionId: string): Promise<void> {
  await authDeleteDoc(doc(db, 'saved_link_collections', collectionId));
}

export async function getUserSavedLinks(userId: string): Promise<SavedLink[]> {
  const snap = await getDocs(query(collection(db, 'saved_links'), where('user_id', '==', userId)));
  return snap.docs
    .map((d) => mapSavedLink(d.id, d.data()))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export async function findSavedLinkByCanonicalUrl(
  userId: string,
  canonicalUrl: string
): Promise<SavedLink | null> {
  const snap = await getDocs(
    query(
      collection(db, 'saved_links'),
      where('user_id', '==', userId),
      where('canonical_url', '==', canonicalUrl)
    )
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return mapSavedLink(d.id, d.data());
}

export async function createSavedLink(params: {
  user_id: string;
  collection_ids?: string[];
  url: string;
  canonical_url: string;
  title: string;
  description?: string | null;
  image_url?: string | null;
  site_name?: string | null;
  favicon_url?: string | null;
  link_type?: SavedLinkType;
  status?: SavedLinkStatus;
  priority?: SavedLinkPriority;
  tags?: string[];
  notes?: string | null;
  timestamp_notes?: SavedLinkTimestampNote[];
  metadata?: SavedLinkMetadata;
  enrichment_pending?: boolean;
}): Promise<SavedLink> {
  const ref = await authAddDoc(collection(db, 'saved_links'), {
    user_id: params.user_id,
    collection_ids: params.collection_ids ?? [],
    url: params.url,
    canonical_url: params.canonical_url,
    title: params.title,
    description: params.description ?? null,
    image_url: params.image_url ?? null,
    site_name: params.site_name ?? null,
    favicon_url: params.favicon_url ?? null,
    link_type: params.link_type ?? 'other',
    status: params.status ?? 'saved',
    priority: params.priority ?? 0,
    tags: params.tags ?? [],
    notes: params.notes ?? null,
    timestamp_notes: params.timestamp_notes ?? [],
    metadata: sanitizeForFirestore(params.metadata ?? {}),
    enrichment_pending: params.enrichment_pending ?? false,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
  const snap = await getDoc(ref);
  return mapSavedLink(snap.id, snap.data() ?? params);
}

export async function updateSavedLink(
  linkId: string,
  updates: Partial<
    Pick<
      SavedLink,
      | 'collection_ids'
      | 'title'
      | 'description'
      | 'image_url'
      | 'site_name'
      | 'favicon_url'
      | 'link_type'
      | 'status'
      | 'priority'
      | 'tags'
      | 'notes'
      | 'timestamp_notes'
      | 'metadata'
      | 'enrichment_pending'
    >
  >
): Promise<void> {
  await authSetDoc(
    doc(db, 'saved_links', linkId),
    sanitizeForFirestore({ ...updates, updated_at: serverTimestamp() }),
    { merge: true }
  );
}

export async function deleteSavedLink(linkId: string): Promise<void> {
  await authDeleteDoc(doc(db, 'saved_links', linkId));
}

export async function ensureDefaultSavedLinkCollections(userId: string): Promise<SavedLinkCollection[]> {
  const existing = await getUserSavedLinkCollections(userId);
  if (existing.length > 0) return existing;
  const defaults = [
    { name: 'Recipes', icon: 'utensils', color: '#f97316' },
    { name: 'Watch later', icon: 'play', color: '#8b5cf6' },
    { name: 'Articles', icon: 'newspaper', color: '#3b82f6' },
    { name: 'Tools', icon: 'wrench', color: '#10b981' },
  ];
  const created: SavedLinkCollection[] = [];
  for (let i = 0; i < defaults.length; i++) {
    const c = await createSavedLinkCollection({
      user_id: userId,
      name: defaults[i].name,
      icon: defaults[i].icon,
      color: defaults[i].color,
      position: i,
    });
    created.push(c);
  }
  return created;
}

export async function deleteAllUserData(userId: string): Promise<void> {
  const [
    productsSnap,
    listsSnap,
    listProductsSnap,
    notificationsSnap,
    outfitsSnap,
    outfitProductsSnap,
    standardListsSnap,
    standardListItemsSnap,
    standardListCommentsSnap,
    savedLinksSnap,
    savedLinkCollectionsSnap,
  ] =
    await Promise.all([
      getDocs(query(collection(db, 'products'), where('user_id', '==', userId))),
      getDocs(query(collection(db, 'lists'), where('user_id', '==', userId))),
      getDocs(query(collection(db, 'list_products'), where('user_id', '==', userId))),
      getDocs(query(collection(db, 'notifications'), where('user_id', '==', userId))),
      getDocs(query(collection(db, 'outfits'), where('user_id', '==', userId))),
      getDocs(query(collection(db, 'outfit_products'), where('user_id', '==', userId))),
      getDocs(query(collection(db, 'standard_lists'), where('user_id', '==', userId))),
      getDocs(query(collection(db, 'standard_list_items'), where('user_id', '==', userId))),
      getDocs(query(collection(db, 'standard_list_comments'), where('user_id', '==', userId))),
      getDocs(query(collection(db, 'saved_links'), where('user_id', '==', userId))),
      getDocs(query(collection(db, 'saved_link_collections'), where('user_id', '==', userId))),
    ]);

  const batch = writeBatch(db);
  productsSnap.docs.forEach((d) => batch.delete(d.ref));
  listsSnap.docs.forEach((d) => batch.delete(d.ref));
  listProductsSnap.docs.forEach((d) => batch.delete(d.ref));
  notificationsSnap.docs.forEach((d) => batch.delete(d.ref));
  outfitProductsSnap.docs.forEach((d) => batch.delete(d.ref));
  outfitsSnap.docs.forEach((d) => batch.delete(d.ref));
  standardListItemsSnap.docs.forEach((d) => batch.delete(d.ref));
  standardListCommentsSnap.docs.forEach((d) => batch.delete(d.ref));
  standardListsSnap.docs.forEach((d) => batch.delete(d.ref));
  savedLinksSnap.docs.forEach((d) => batch.delete(d.ref));
  savedLinkCollectionsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'profiles', userId));
  await authBatchCommit(batch);
}

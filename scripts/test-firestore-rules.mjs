import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

const PROJECT_ID = 'stashd-rules-test';
const USER = { uid: 'user-abc', email: 'test@example.com' };

async function run() {
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });

  await testEnv.clearFirestore();

  const authed = testEnv.authenticatedContext(USER.uid, { email: USER.email });
  const db = authed.firestore();

  // Seed list + product for list_products join tests
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    await setDoc(doc(adminDb, 'lists', 'list-wish'), {
      user_id: USER.uid,
      name: 'Wishlist',
      scope: 'wishlist',
      is_shared: false,
      share_token: null,
    });
    await setDoc(doc(adminDb, 'lists', 'list-stash'), {
      user_id: USER.uid,
      name: 'Stash',
      scope: 'stash',
      is_shared: false,
      share_token: null,
    });
    await setDoc(doc(adminDb, 'products', 'prod-owned'), {
      user_id: USER.uid,
      title: 'Owned',
      is_owned: true,
    });
    await setDoc(doc(adminDb, 'products', 'prod-wish'), {
      user_id: USER.uid,
      title: 'Wish',
      is_owned: false,
    });
    await setDoc(doc(adminDb, 'standard_lists', 'std-1'), {
      user_id: USER.uid,
      name: 'Tasks',
      collaborator_emails: [],
      is_shared: false,
    });
  });

  console.log('products create...');
  await assertSucceeds(
    addDoc(collection(db, 'products'), {
      user_id: USER.uid,
      title: 'New',
      is_owned: false,
      add_detail_level: 'quick',
      detailed_enrichment_pending: true,
    })
  );

  console.log('lists create...');
  await assertSucceeds(
    addDoc(collection(db, 'lists'), {
      user_id: USER.uid,
      name: 'New list',
      scope: 'wishlist',
      is_shared: false,
      share_token: 'tok',
    })
  );

  console.log('list_products create (wishlist)...');
  await assertSucceeds(
    addDoc(collection(db, 'list_products'), {
      user_id: USER.uid,
      list_id: 'list-wish',
      product_id: 'prod-wish',
    })
  );

  console.log('list_products create (stash + not owned) should fail...');
  await assertFails(
    addDoc(collection(db, 'list_products'), {
      user_id: USER.uid,
      list_id: 'list-stash',
      product_id: 'prod-wish',
    })
  );

  console.log('standard_lists create...');
  await assertSucceeds(
    addDoc(collection(db, 'standard_lists'), {
      user_id: USER.uid,
      name: 'New std',
      collaborator_emails: [],
      is_shared: false,
    })
  );

  console.log('standard_list_items create...');
  await assertSucceeds(
    addDoc(collection(db, 'standard_list_items'), {
      user_id: USER.uid,
      list_id: 'std-1',
      text: 'Item',
      position: 0,
      is_completed: false,
    })
  );

  console.log('saved_links create...');
  await assertSucceeds(
    addDoc(collection(db, 'saved_links'), {
      user_id: USER.uid,
      url: 'https://example.com',
      canonical_url: 'https://example.com',
      title: 'Link',
      collection_ids: [],
    })
  );

  console.log('saved_links query by canonical_url...');
  await assertSucceeds(
    getDocs(
      query(
        collection(db, 'saved_links'),
        where('user_id', '==', USER.uid),
        where('canonical_url', '==', 'https://example.com')
      )
    )
  );

  console.log('profiles create...');
  await assertSucceeds(
    setDoc(doc(db, 'profiles', USER.uid), {
      id: USER.uid,
      email: USER.email,
      name: 'Test',
    })
  );

  console.log('\nAll rule checks passed.');
  await testEnv.cleanup();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

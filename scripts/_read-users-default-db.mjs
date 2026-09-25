import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const targetUid = 'LKeYuXvA7tRBu8qsafDo1NS795D3';
const targetEmail = 'admin@ziricai.com';

try {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'ziricai' });
  }
  const db = getFirestore(undefined, 'default');
  const snap = await db.collection('users').limit(25).get();
  console.log('usersCollectionCount:', snap.size);
  const rows = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    rows.push({
      docId: doc.id,
      email: data.email || null,
      role: data.role || null,
      status: data.status || null,
      matchesAuthUid: doc.id === targetUid,
      emailMatchesAdmin: String(data.email || '').toLowerCase() === targetEmail,
    });
  }
  console.log(JSON.stringify({ authUid: targetUid, authEmail: targetEmail, users: rows }, null, 2));
  const direct = await db.doc(`users/${targetUid}`).get();
  console.log('directLookup:', JSON.stringify({ path: `users/${targetUid}`, exists: direct.exists }));
} catch (err) {
  console.error('READ_FAILED:', err.message);
  process.exit(1);
}

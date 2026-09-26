import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';
import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCZFgj8OcZbpodJdIKgApYjxBVAab3OHP4',
  authDomain: 'gerart-6cdc1.firebaseapp.com',
  projectId: 'gerart-6cdc1',
  storageBucket: 'gerart-6cdc1.firebasestorage.app',
  messagingSenderId: '13831365526',
  appId: '1:13831365526:web:e644234adee484482d33b7'
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);
// Keep the session across browser restarts until an explicit sign-out.
setPersistence(auth, browserLocalPersistence).catch(() => {});
// Cloudinary configuration - set these values for unsigned uploads
const CLOUDINARY_CLOUD_NAME = 'dqe7z0kdx';
// Default unsigned preset name. Create this preset in your Cloudinary dashboard
// or use the curl command shown after applying these changes.
const CLOUDINARY_UPLOAD_PRESET = 'unsigned_previnterim';
const apiBaseUrl = 'https://europe-west1-gerart-6cdc1.cloudfunctions.net/api';
const rows = (snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

// Writes the Firestore profile of a freshly authenticated user. Shared by the
// email/password sign-up and by the first Google sign-in.
async function createAccountProfile(user, { role, name, phone, city, companyName, siret }) {
  if (!['candidate', 'company'].includes(role)) throw new Error('Rôle non autorisé.');
  const uid = user.uid;
  const displayName = role === 'company' ? companyName : name;

  await setDoc(doc(db, 'users', uid), {
    email: user.email,
    role,
    displayName,
    status: role === 'company' ? 'pending' : 'active',
    createdAt: serverTimestamp()
  });

  if (role === 'candidate') {
    await setDoc(doc(db, 'candidateProfiles', uid), {
      name,
      phone,
      city,
      skills: [],
      experience: '',
      availability: '',
      documentProvider: 'google-drive-pending',
      updatedAt: serverTimestamp()
    });
  } else {
    await setDoc(doc(db, 'companies', uid), {
      companyName,
      contactName: name,
      phone,
      city,
      siret: siret || '',
      status: 'pending',
      updatedAt: serverTimestamp()
    });
  }
}

async function register({ email, password, ...profile }) {
  if (!['candidate', 'company'].includes(profile.role)) throw new Error('Rôle non autorisé.');
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await createAccountProfile(credential.user, profile);
  return credential.user;
}

async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    return await signInWithPopup(auth, provider);
  } catch (error) {
    // Some mobile browsers block popups: fall back to a full-page redirect.
    if (error.code === 'auth/popup-blocked') return signInWithRedirect(auth, provider);
    throw error;
  }
}

const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
const logout = () => signOut(auth);
const resetPassword = (email) => sendPasswordResetEmail(auth, email);

async function apiRequest(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentification requise.');
  const token = await user.getIdToken();
  const requestOptions = {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
  };

  const primary = `/api${path}`;
  const fallback = `${apiBaseUrl}${path}`;

  const parseResponse = async (response) => {
    const text = await response.text();
    let payload = {};
    if (text) { try { payload = JSON.parse(text); } catch { payload = {}; } }
    if (response.ok) return payload;
    throw new Error(payload.error || `Erreur HTTP ${response.status}.`);
  };

  try {
    return await parseResponse(await fetch(primary, requestOptions));
  } catch (primaryError) {
    // Only fall back to direct URL on network errors (CORS/offline), not on HTTP errors
    if (primaryError.name !== 'TypeError') throw primaryError;
    try {
      return await parseResponse(await fetch(fallback, requestOptions));
    } catch (fallbackError) {
      throw primaryError;
    }
  }
}

const getDriveStatus = () => apiRequest('/drive/status');
const connectGoogleDrive = () => apiRequest('/drive/connect', { method: 'POST' });
function uploadDriveDocument(file, documentType, candidateId = '') {
  const body = new FormData();
  body.append('file', file);
  body.append('documentType', documentType);
  if (candidateId) body.append('candidateId', candidateId);
  return apiRequest('/drive/upload', { method: 'POST', body });
}

async function uploadStorageDocument(file, documentType, candidateId = '') {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentification requise.');
  const uid = candidateId || user.uid;
  const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `candidate-documents/${uid}/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);
  const uploadTask = await uploadBytesResumable(storageRef, file);
  const url = await getDownloadURL(storageRef);

  const document = {
    candidateId: uid,
    storageUrl: url,
    name: file.name || uploadTask.metadata.name,
    mimeType: file.type || uploadTask.metadata.contentType,
    documentType: documentType || 'other',
    uploadedBy: user.uid,
    createdAt: serverTimestamp()
  };

  const documentRef = await addDoc(collection(db, 'candidateDocuments'), document);
  await setDoc(doc(db, 'candidateProfiles', uid), { documentProvider: 'firebase-storage', updatedAt: serverTimestamp() }, { merge: true });
  return { id: documentRef.id, name: document.name, documentType: document.documentType };
}

async function uploadCloudinaryDocument(file, documentType, candidateId = '') {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) throw new Error('Cloudinary non configuré.');
  const user = auth.currentUser;
  if (!user) throw new Error('Authentification requise.');
  const uid = candidateId || user.uid;

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  form.append('folder', `candidate-documents/${uid}`);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: 'POST', body: form });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error?.message || payload.error || `Erreur Cloudinary ${res.status}`);

  const document = {
    candidateId: uid,
    cloudinaryUrl: payload.secure_url || payload.url,
    publicId: payload.public_id,
    name: payload.original_filename || file.name,
    mimeType: payload.resource_type === 'image' ? payload.format : file.type,
    documentType: documentType || 'other',
    uploadedBy: user.uid,
    createdAt: serverTimestamp()
  };

  const documentRef = await addDoc(collection(db, 'candidateDocuments'), document);
  await setDoc(doc(db, 'candidateProfiles', uid), { documentProvider: 'cloudinary', updatedAt: serverTimestamp() }, { merge: true });
  return { id: documentRef.id, name: document.name, documentType: document.documentType };
}

// Returns null when the account exists in Firebase Auth but has no profile yet
// (first Google sign-in): the app then asks the user to finish signing up.
async function getSessionProfile(user) {
  const snapshot = await getDoc(doc(db, 'users', user.uid));
  if (!snapshot.exists()) return null;
  return { uid: user.uid, email: user.email, ...snapshot.data() };
}

const PAGE_SIZE = 40;
const pageInfo = (snapshot) => ({
  cursor: snapshot.docs[snapshot.docs.length - 1] || null,
  hasMore: snapshot.docs.length === PAGE_SIZE
});

async function loadWorkspace(session) {
  const result = { missions: [], applications: [], profiles: [], companies: [], proposals: [], interviews: [], pagination: {} };
  const published = query(collection(db, 'missions'), where('status', '==', 'published'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));

  if (session.role === 'candidate') {
    const [missions, applications, profile, interviews] = await Promise.all([
      getDocs(published),
      getDocs(query(collection(db, 'applications'), where('candidateId', '==', session.uid))),
      getDoc(doc(db, 'candidateProfiles', session.uid)),
      getDocs(query(collection(db, 'interviews'), where('candidateId', '==', session.uid)))
    ]);
    result.missions = rows(missions);
    result.applications = rows(applications);
    result.profile = profile.exists() ? profile.data() : {};
    result.interviews = rows(interviews);
    result.pagination.missions = pageInfo(missions);
  } else if (session.role === 'company') {
    const [missions, proposals, company] = await Promise.all([
      getDocs(query(collection(db, 'missions'), where('companyId', '==', session.uid))),
      getDocs(query(collection(db, 'proposals'), where('companyId', '==', session.uid))),
      getDoc(doc(db, 'companies', session.uid))
    ]);
    result.missions = await withPrivateTerms(rows(missions));
    result.proposals = rows(proposals);
    result.company = company.exists() ? company.data() : {};
  } else if (session.role === 'admin') {
    const [missions, applications, profiles, companies, proposals, interviews] = await Promise.all([
      getDocs(query(collection(db, 'missions'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE))),
      getDocs(query(collection(db, 'applications'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE))),
      getDocs(query(collection(db, 'candidateProfiles'), orderBy('updatedAt', 'desc'), limit(PAGE_SIZE))),
      getDocs(query(collection(db, 'companies'), orderBy('updatedAt', 'desc'), limit(PAGE_SIZE))),
      getDocs(query(collection(db, 'proposals'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE))),
      getDocs(query(collection(db, 'interviews'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE)))
    ]);
    Object.assign(result, {
      missions: await withPrivateTerms(rows(missions)), applications: rows(applications), profiles: rows(profiles),
      companies: rows(companies), proposals: rows(proposals), interviews: rows(interviews)
    });
    result.pagination = {
      missions: pageInfo(missions), applications: pageInfo(applications), profiles: pageInfo(profiles),
      companies: pageInfo(companies), proposals: pageInfo(proposals), interviews: pageInfo(interviews)
    };
  }
  return result;
}

// Public job board: no auth required, only ever the published missions.
async function loadPublicMissions() {
  const snap = await getDocs(query(collection(db, 'missions'), where('status', '==', 'published'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE)));
  return { missions: rows(snap), pagination: pageInfo(snap) };
}

async function countPublishedMissions() {
  const snap = await getCountFromServer(query(collection(db, 'missions'), where('status', '==', 'published')));
  return snap.data().count;
}

// Public contact form. Emails to the sender and to the admin are sent by a Cloud Function trigger.
function submitContactMessage({ name, email, phone, topic, subject, message }) {
  return addDoc(collection(db, 'contactMessages'), {
    name: name.trim(), email: email.trim(), phone: (phone || '').trim(), topic,
    subject: subject.trim(), message: message.trim(),
    uid: auth.currentUser?.uid || null,
    createdAt: serverTimestamp()
  });
}

async function loadMorePublicMissions(cursor) {
  const snap = await getDocs(query(collection(db, 'missions'), where('status', '==', 'published'), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE)));
  return { rows: rows(snap), ...pageInfo(snap) };
}

const MORE_PAGE_QUERIES = {
  candidate: {
    missions: (cursor) => query(collection(db, 'missions'), where('status', '==', 'published'), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE))
  },
  admin: {
    missions: (cursor) => query(collection(db, 'missions'), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE)),
    applications: (cursor) => query(collection(db, 'applications'), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE)),
    profiles: (cursor) => query(collection(db, 'candidateProfiles'), orderBy('updatedAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE)),
    companies: (cursor) => query(collection(db, 'companies'), orderBy('updatedAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE)),
    proposals: (cursor) => query(collection(db, 'proposals'), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE)),
    interviews: (cursor) => query(collection(db, 'interviews'), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE))
  }
};

async function loadMorePage(session, kind, cursor) {
  const builder = MORE_PAGE_QUERIES[session.role]?.[kind];
  if (!builder) throw new Error('Pagination non disponible pour cette liste.');
  const snapshot = await getDocs(builder(cursor));
  const list = kind === 'missions' && session.role === 'admin' ? await withPrivateTerms(rows(snapshot)) : rows(snapshot);
  return { rows: list, ...pageInfo(snapshot) };
}

// Mission documents are publicly readable (job board), so the pay offered by the
// company lives in missions/{id}/private/terms, readable by admin and owner only.
async function createMission(session, values) {
  if (!['company', 'admin'].includes(session.role)) throw new Error('Action non autorisée.');
  if (session.role === 'company' && session.status !== 'active') {
    throw new Error('Votre entreprise doit être validée avant de créer une mission.');
  }
  const { pay, ...publicValues } = values;
  const missionRef = doc(collection(db, 'missions'));
  const batch = writeBatch(db);
  batch.set(missionRef, {
    ...publicValues,
    companyId: session.role === 'company' ? session.uid : values.companyId || session.uid,
    companyName: values.companyName || session.displayName,
    status: session.role === 'admin' ? 'published' : 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.set(doc(db, 'missions', missionRef.id, 'private', 'terms'), { pay: pay || '', updatedAt: serverTimestamp() });
  await batch.commit();
  return missionRef;
}

// Adds the private pay to missions for the admin and the owning company.
// Imported missions never have private terms, so they are skipped.
async function withPrivateTerms(missions) {
  const terms = await Promise.all(missions.map((m) => m.source
    ? null
    : getDoc(doc(db, 'missions', m.id, 'private', 'terms')).then((s) => (s.exists() ? s.data() : null)).catch(() => null)));
  return missions.map((m, i) => (terms[i] ? { ...m, pay: terms[i].pay } : m));
}

function applyToMission(session, mission) {
  if (session.role !== 'candidate') throw new Error('Action réservée aux candidats.');
  return addDoc(collection(db, 'applications'), {
    candidateId: session.uid,
    candidateName: session.displayName,
    missionId: mission.id,
    missionTitle: mission.title,
    city: mission.city,
    companyId: mission.companyId,
    status: 'pending',
    internalNotes: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

function updateMissionStatus(id, status) {
  return updateDoc(doc(db, 'missions', id), { status, updatedAt: serverTimestamp() });
}

function updateApplication(id, values) {
  return updateDoc(doc(db, 'applications', id), { ...values, updatedAt: serverTimestamp() });
}

function saveCandidateProfile(uid, values) {
  return setDoc(doc(db, 'candidateProfiles', uid), { ...values, updatedAt: serverTimestamp() }, { merge: true });
}

function saveCompanyProfile(uid, values) {
  return setDoc(doc(db, 'companies', uid), { ...values, updatedAt: serverTimestamp() }, { merge: true });
}

function updateCompanyStatus(uid, status) {
  const updates = [updateDoc(doc(db, 'companies', uid), { status, updatedAt: serverTimestamp() })];
  if (!uid.startsWith('scraped_')) updates.push(updateDoc(doc(db, 'users', uid), { status }));
  return Promise.all(updates);
}

function triggerScrape() {
  return apiRequest('/scrape', { method: 'POST' });
}

function createProposal(values) {
  return addDoc(collection(db, 'proposals'), {
    ...values,
    response: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

function respondToProposal(id, response) {
  return updateDoc(doc(db, 'proposals', id), { response, updatedAt: serverTimestamp() });
}

async function loadAcceptedProposals(session) {
  const field = session.role === 'candidate' ? 'candidateId' : 'companyId';
  const snap = await getDocs(query(
    collection(db, 'proposals'), where(field, '==', session.uid), where('response', '==', 'accepted')
  ));
  return rows(snap);
}

function createInterview(values) {
  return addDoc(collection(db, 'interviews'), { ...values, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

async function getDocumentsForCandidate(candidateId) {
  const snap = await getDocs(query(collection(db, 'candidateDocuments'), where('candidateId', '==', candidateId)));
  return rows(snap);
}

export {
  applyToMission, auth, countPublishedMissions, createAccountProfile, createInterview, createMission, createProposal, db, firebaseApp,
  connectGoogleDrive, getDriveStatus, getDocumentsForCandidate, getSessionProfile, loadAcceptedProposals,
  loadMorePage, loadMorePublicMissions, loadPublicMissions, loadWorkspace, login, logout,
  onAuthStateChanged, register, resetPassword, respondToProposal, saveCandidateProfile, saveCompanyProfile,
  signInWithGoogle, submitContactMessage,
  storage, triggerScrape, updateApplication,
  updateCompanyStatus, updateMissionStatus, uploadDriveDocument, uploadStorageDocument,
  uploadCloudinaryDocument
};

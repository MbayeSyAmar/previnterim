import { db } from './firebase.js';
import {
  addDoc, collection, doc, getDoc, increment, onSnapshot, orderBy,
  query, serverTimestamp, setDoc, updateDoc, where
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';

const rows = (snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

const emptyUnread = { admin: 0, candidate: 0, company: 0 };
const adminCandidateId = (candidateId) => `adminCandidate_${candidateId}`;
const adminCompanyId = (companyId) => `adminCompany_${companyId}`;
const candidateCompanyId = (candidateId, companyId) => `cc_${candidateId}_${companyId}`;

async function ensureConversation(id, data) {
  const ref = doc(db, 'conversations', id);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id, ...snap.data() };
  const payload = { ...data, lastMessage: '', lastMessageAt: serverTimestamp(), unread: { ...emptyUnread }, createdAt: serverTimestamp() };
  await setDoc(ref, payload);
  return { id, ...payload };
}

function ensureAdminCandidateConversation(candidateId, candidateName = '') {
  return ensureConversation(adminCandidateId(candidateId), {
    type: 'admin-candidate', candidateId, companyId: null, candidateName
  });
}

function ensureAdminCompanyConversation(companyId, companyName = '') {
  return ensureConversation(adminCompanyId(companyId), {
    type: 'admin-company', candidateId: null, companyId, companyName
  });
}

function ensureCandidateCompanyConversation(candidateId, companyId, context = {}) {
  return ensureConversation(candidateCompanyId(candidateId, companyId), {
    type: 'candidate-company', candidateId, companyId,
    candidateName: context.candidateName || '', companyName: context.companyName || '',
    missionTitle: context.missionTitle || ''
  });
}

function subscribeConversations(session, callback) {
  const field = session.role === 'candidate' ? 'candidateId' : session.role === 'company' ? 'companyId' : null;
  const q = field
    ? query(collection(db, 'conversations'), where(field, '==', session.uid))
    : query(collection(db, 'conversations'));
  return onSnapshot(q, (snap) => callback(rows(snap)), () => callback([]));
}

function subscribeMessages(conversationId, callback) {
  const q = query(collection(db, 'conversations', conversationId, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => callback(rows(snap)), () => callback([]));
}

async function sendMessage(conversation, session, text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  await addDoc(collection(db, 'conversations', conversation.id, 'messages'), {
    senderId: session.uid, senderRole: session.role, text: trimmed, createdAt: serverTimestamp()
  });
  let bumpKey = 'unread.candidate';
  if (conversation.type === 'admin-candidate') bumpKey = session.role === 'candidate' ? 'unread.admin' : 'unread.candidate';
  else if (conversation.type === 'admin-company') bumpKey = session.role === 'company' ? 'unread.admin' : 'unread.company';
  else bumpKey = session.role === 'candidate' ? 'unread.company' : 'unread.candidate';
  await updateDoc(doc(db, 'conversations', conversation.id), {
    lastMessage: trimmed, lastMessageAt: serverTimestamp(), [bumpKey]: increment(1)
  });
}

function markConversationRead(conversation, session) {
  const key = session.role === 'admin' ? 'admin' : session.role === 'candidate' ? 'candidate' : 'company';
  if (!conversation.unread?.[key]) return Promise.resolve();
  return updateDoc(doc(db, 'conversations', conversation.id), { [`unread.${key}`]: 0 });
}

export {
  ensureAdminCandidateConversation, ensureAdminCompanyConversation, ensureCandidateCompanyConversation,
  markConversationRead, sendMessage, subscribeConversations, subscribeMessages
};

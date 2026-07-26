import { db } from './firebase.js';
import {
  addDoc, collection, doc, increment, onSnapshot, orderBy,
  query, serverTimestamp, setDoc, updateDoc, where
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';

const rows = (snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

const adminCandidateId = (candidateId) => `adminCandidate_${candidateId}`;
const adminCompanyId = (companyId) => `adminCompany_${companyId}`;
const candidateCompanyId = (candidateId, companyId) => `cc_${candidateId}_${companyId}`;

// Merge-set only the static, unchanging fields (type/participants/names) — never
// lastMessage/unread/createdAt here. Firestore treats this as a create the first
// time and a no-op update afterwards, so there is no need to read the document
// first: a read on a not-yet-existing conversation would itself be denied by the
// security rules (they check resource.data, which requires the doc to exist).
function ensureConversation(id, data) {
  return setDoc(doc(db, 'conversations', id), data, { merge: true });
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

// Opens the door for candidate<->company messaging. Must be called only after
// the proposal's `response` is already 'accepted' in Firestore (the security
// rule re-checks this itself, so calling it earlier simply fails).
function createChatGrant(proposal, companyId) {
  return setDoc(doc(db, 'chatGrants', `${proposal.candidateId}_${companyId}`), {
    candidateId: proposal.candidateId,
    companyId,
    proposalId: proposal.id,
    missionId: proposal.missionId || null,
    grantedAt: serverTimestamp()
  }, { merge: true });
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
  createChatGrant, ensureAdminCandidateConversation, ensureAdminCompanyConversation, ensureCandidateCompanyConversation,
  markConversationRead, sendMessage, subscribeConversations, subscribeMessages
};

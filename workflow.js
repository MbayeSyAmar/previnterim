import { db } from './firebase.js';
import {
  addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query,
  serverTimestamp, startAfter, updateDoc, where, writeBatch
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';

const rows = (snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
const PAGE_SIZE = 40;
const pageInfo = (snapshot) => ({
  cursor: snapshot.docs[snapshot.docs.length - 1] || null,
  hasMore: snapshot.docs.length === PAGE_SIZE
});

// ── Placements ──────────────────────────────────────────────────────────────

async function createPlacement(session, values) {
  if (session.role !== 'admin') throw new Error('Action réservée à l\'administrateur.');
  const { payRate, billRate, ...rest } = values;
  const placementRef = doc(collection(db, 'placements'));
  const batch = writeBatch(db);
  batch.set(placementRef, {
    ...rest,
    billRate: Number(billRate),
    status: 'active',
    endDate: null,
    endReason: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.set(doc(db, 'placements', placementRef.id, 'private', 'rates'), { payRate: Number(payRate) });
  await batch.commit();
  return placementRef.id;
}

async function getPlacementRate(placementId) {
  const snap = await getDoc(doc(db, 'placements', placementId, 'private', 'rates'));
  return snap.exists() ? snap.data().payRate : null;
}

function endPlacement(id, endReason) {
  return updateDoc(doc(db, 'placements', id), {
    status: 'ended',
    endDate: new Date().toISOString().slice(0, 10),
    endReason,
    updatedAt: serverTimestamp()
  });
}

async function loadPlacementsWorkspace(session) {
  if (session.role === 'candidate') {
    const snap = await getDocs(query(collection(db, 'placements'), where('candidateId', '==', session.uid)));
    return { placements: rows(snap) };
  }
  if (session.role === 'company') {
    const snap = await getDocs(query(collection(db, 'placements'), where('companyId', '==', session.uid)));
    return { placements: rows(snap) };
  }
  // Not paginated: the kanban board doesn't lend itself to a "load more" control,
  // and placement volume stays modest at this stage.
  const snap = await getDocs(query(collection(db, 'placements'), orderBy('createdAt', 'desc'), limit(200)));
  return { placements: rows(snap) };
}

// ── Feuilles de temps ─────────────────────────────────────────────────────────

function submitTimesheet(values) {
  return addDoc(collection(db, 'timesheets'), {
    ...values,
    status: 'submitted',
    companyNote: '',
    invoiceId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

function resubmitTimesheet(id, values) {
  return updateDoc(doc(db, 'timesheets', id), { ...values, status: 'submitted', companyNote: '', updatedAt: serverTimestamp() });
}

function respondToTimesheet(id, status, companyNote = '') {
  return updateDoc(doc(db, 'timesheets', id), { status, companyNote, updatedAt: serverTimestamp() });
}

async function loadTimesheetsWorkspace(session, statusFilter = 'all') {
  if (session.role === 'candidate') {
    const snap = await getDocs(query(collection(db, 'timesheets'), where('candidateId', '==', session.uid)));
    return { timesheets: rows(snap) };
  }
  if (session.role === 'company') {
    const snap = await getDocs(query(collection(db, 'timesheets'), where('companyId', '==', session.uid)));
    return { timesheets: rows(snap) };
  }
  const base = statusFilter !== 'all'
    ? query(collection(db, 'timesheets'), where('status', '==', statusFilter), orderBy('createdAt', 'desc'), limit(PAGE_SIZE))
    : query(collection(db, 'timesheets'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
  const snap = await getDocs(base);
  return { timesheets: rows(snap), pagination: pageInfo(snap) };
}

async function loadMoreTimesheets(statusFilter, cursor) {
  const base = statusFilter !== 'all'
    ? query(collection(db, 'timesheets'), where('status', '==', statusFilter), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE))
    : query(collection(db, 'timesheets'), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE));
  const snap = await getDocs(base);
  return { timesheets: rows(snap), pagination: pageInfo(snap) };
}

// ── Facturation, paiement, commission ─────────────────────────────────────────
// Une facture (entreprise) et un paiement (candidat) sont toujours générés ensemble,
// à partir des feuilles de temps validées d'un placement, puis verrouillées pour
// éviter toute double facturation. La commission (billRate - payRate) n'est jamais
// stockée : elle se calcule à la volée en croisant invoice.totalAmount et
// candidatePayment.amount côté admin (seul rôle pouvant lire les deux).

async function generateInvoiceAndPayment(session, placement) {
  if (session.role !== 'admin') throw new Error('Action réservée à l\'administrateur.');
  const snap = await getDocs(query(
    collection(db, 'timesheets'),
    where('placementId', '==', placement.id),
    where('status', '==', 'validated')
  ));
  const timesheets = rows(snap);
  if (!timesheets.length) throw new Error('Aucune feuille de temps validée à facturer pour ce placement.');

  const payRate = await getPlacementRate(placement.id);
  if (payRate == null) throw new Error('Taux payé au candidat introuvable pour ce placement.');

  const totalHours = timesheets.reduce((sum, t) => sum + (t.totalHours || 0), 0);
  const billAmount = Math.round(totalHours * placement.billRate);
  const payAmount = Math.round(totalHours * payRate);
  const periods = timesheets.map((t) => t.periodStart).sort();
  const periodsEnd = timesheets.map((t) => t.periodEnd).sort();

  const invoiceRef = doc(collection(db, 'invoices'));
  const paymentRef = doc(collection(db, 'candidatePayments'));
  const batch = writeBatch(db);

  batch.set(invoiceRef, {
    companyId: placement.companyId,
    companyName: placement.companyName,
    periodStart: periods[0],
    periodEnd: periodsEnd[periodsEnd.length - 1],
    lines: [{
      placementId: placement.id, candidateName: placement.candidateName, missionTitle: placement.missionTitle,
      hours: totalHours, billRate: placement.billRate, amount: billAmount
    }],
    totalAmount: billAmount,
    status: 'draft',
    timesheetIds: timesheets.map((t) => t.id),
    paymentId: paymentRef.id,
    issuedAt: null,
    dueDate: null,
    paidAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  batch.set(paymentRef, {
    candidateId: placement.candidateId,
    candidateName: placement.candidateName,
    placementId: placement.id,
    periodStart: periods[0],
    periodEnd: periodsEnd[periodsEnd.length - 1],
    hours: totalHours,
    payRate,
    amount: payAmount,
    status: 'pending',
    invoiceId: invoiceRef.id,
    paidAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  timesheets.forEach((t) => {
    batch.update(doc(db, 'timesheets', t.id), { status: 'locked', invoiceId: invoiceRef.id, updatedAt: serverTimestamp() });
  });

  await batch.commit();
  return { invoiceId: invoiceRef.id, paymentId: paymentRef.id };
}

function updateInvoiceStatus(id, status) {
  const extra = status === 'sent' ? { issuedAt: serverTimestamp() } : status === 'paid' ? { paidAt: serverTimestamp() } : {};
  return updateDoc(doc(db, 'invoices', id), { status, ...extra, updatedAt: serverTimestamp() });
}

function updatePaymentStatus(id, status) {
  const extra = status === 'paid' ? { paidAt: serverTimestamp() } : {};
  return updateDoc(doc(db, 'candidatePayments', id), { status, ...extra, updatedAt: serverTimestamp() });
}

async function loadInvoicesWorkspace(session) {
  if (session.role === 'company') {
    const snap = await getDocs(query(
      collection(db, 'invoices'),
      where('companyId', '==', session.uid),
      where('status', 'in', ['sent', 'paid'])
    ));
    return rows(snap);
  }
  const snap = await getDocs(query(collection(db, 'invoices'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE)));
  return rows(snap);
}

async function loadPaymentsWorkspace(session) {
  if (session.role === 'candidate') {
    const snap = await getDocs(query(collection(db, 'candidatePayments'), where('candidateId', '==', session.uid)));
    return rows(snap);
  }
  const snap = await getDocs(query(collection(db, 'candidatePayments'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE)));
  return rows(snap);
}

// ── Suivi post-placement ──────────────────────────────────────────────────────

function createFollowUp(session, placement, values) {
  if (session.role !== 'admin') throw new Error('Action réservée à l\'administrateur.');
  return addDoc(collection(db, 'followUps'), {
    placementId: placement.id,
    candidateId: placement.candidateId,
    companyId: placement.companyId,
    missionTitle: placement.missionTitle,
    note: values.note || '',
    satisfaction: values.satisfaction ? Number(values.satisfaction) : null,
    createdBy: session.uid,
    createdAt: serverTimestamp()
  });
}

async function loadFollowUps(placementId) {
  const snap = await getDocs(query(collection(db, 'followUps'), where('placementId', '==', placementId)));
  return rows(snap);
}

// ── Agrégateur, une entrée par rôle (même esprit que loadWorkspace dans firebase.js) ──

async function loadWorkflowWorkspace(session) {
  const result = { placements: [], timesheets: [], invoices: [], payments: [], pagination: {} };

  if (session.role === 'candidate') {
    const [placementsRes, timesheetsRes, payments] = await Promise.all([
      loadPlacementsWorkspace(session), loadTimesheetsWorkspace(session), loadPaymentsWorkspace(session)
    ]);
    result.placements = placementsRes.placements;
    result.timesheets = timesheetsRes.timesheets;
    result.payments = payments;
    await Promise.all(result.placements.filter((p) => p.status === 'active').map(async (p) => {
      p.payRate = await getPlacementRate(p.id);
    }));
  } else if (session.role === 'company') {
    const [placementsRes, timesheetsRes, invoices] = await Promise.all([
      loadPlacementsWorkspace(session), loadTimesheetsWorkspace(session), loadInvoicesWorkspace(session)
    ]);
    result.placements = placementsRes.placements;
    result.timesheets = timesheetsRes.timesheets;
    result.invoices = invoices;
  } else {
    const [placementsRes, timesheetsRes, invoices, payments] = await Promise.all([
      loadPlacementsWorkspace(session), loadTimesheetsWorkspace(session, 'validated'),
      loadInvoicesWorkspace(session), loadPaymentsWorkspace(session)
    ]);
    result.placements = placementsRes.placements;
    result.timesheets = timesheetsRes.timesheets;
    result.pagination.timesheets = timesheetsRes.pagination;
    result.invoices = invoices;
    result.payments = payments;
    await Promise.all(result.placements.filter((p) => p.status === 'active').map(async (p) => {
      p.payRate = await getPlacementRate(p.id);
    }));
  }
  return result;
}

export {
  createFollowUp, createPlacement, endPlacement, generateInvoiceAndPayment,
  loadFollowUps, loadInvoicesWorkspace, loadMoreTimesheets, loadPaymentsWorkspace, loadPlacementsWorkspace,
  loadTimesheetsWorkspace, loadWorkflowWorkspace, resubmitTimesheet,
  respondToTimesheet, submitTimesheet, updateInvoiceStatus, updatePaymentStatus
};

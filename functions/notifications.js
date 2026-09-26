// Email notifications driven by Firestore writes. Running them server-side means the
// browser never holds a mail credential and cannot send arbitrary content.
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { config, esc, sendMail, sendPair } = require('./mail');

const brevoApiKey = defineSecret('BREVO_API_KEY');
const options = (document) => ({ document, region: 'europe-west1', secrets: [brevoApiKey], retry: false });

const applicationStatus = { pending: 'En attente', reviewing: "En cours d'examen", interview: 'Entretien prévu', presented: 'Présentée au client', accepted: 'Acceptée', rejected: 'Non retenue' };
const missionStatus = { pending: 'En attente de validation', published: 'Publiée', suspended: 'Suspendue', closed: 'Clôturée' };

const db = () => getFirestore();
const isScraped = (id = '', data = {}) => id.startsWith('scraped_') || Boolean(data.source);
const frDate = (date = new Date()) => date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Dakar' });
const frDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '';
  return date.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Dakar' });
};

// Firestore triggers are delivered at least once. Claiming the event id first
// guarantees the same event never sends the same emails twice.
async function firstDelivery(eventId) {
  try {
    await db().doc(`serverOnlyMailLog/${eventId}`).create({ at: FieldValue.serverTimestamp() });
    return true;
  } catch (error) {
    if (error.code === 6) return false; // ALREADY_EXISTS
    throw error;
  }
}

async function contactOf(uid) {
  const snapshot = await db().doc(`users/${uid}`).get();
  const data = snapshot.exists ? snapshot.data() : {};
  let { email, displayName } = data;
  let provider = 'E-mail et mot de passe';
  try {
    const record = await getAuth().getUser(uid);
    email = email || record.email;
    displayName = displayName || record.displayName;
    if (record.providerData.some((p) => p.providerId === 'google.com')) provider = 'Google';
  } catch { /* auth record missing: keep Firestore values */ }
  return { email, name: displayName || '', provider };
}

// Wraps a handler with the idempotency guard and error logging.
const handle = (fn) => async (event) => {
  if (!event.data) return;
  if (!(await firstDelivery(event.id))) return;
  try { await fn(event); } catch (error) { console.error(error); }
};

exports.onCandidateRegistered = onDocumentCreated(options('candidateProfiles/{uid}'), handle(async (event) => {
  const { uid } = event.params;
  const profile = event.data.data();
  const user = await contactOf(uid);
  await sendPair(
    {
      to: user.email, toName: profile.name, tag: 'inscription-candidat',
      subject: 'Votre compte candidat Interim est créé',
      content: {
        title: `Bienvenue ${profile.name || ''}`.trim(),
        intro: 'Votre compte candidat est actif. Pour que notre équipe puisse vous proposer des missions, complétez votre profil (compétences, expérience, disponibilités) et déposez votre CV.',
        cta: { label: 'Compléter mon profil', url: config().appUrl }
      }
    },
    {
      subject: `Nouvelle inscription candidat : ${profile.name || user.email}`, tag: 'admin-inscription',
      replyTo: user.email ? { email: user.email, name: profile.name || undefined } : undefined,
      content: {
        title: 'Nouvelle inscription candidat',
        intro: 'Un candidat vient de créer son compte.',
        rows: [['Nom', profile.name], ['E-mail', user.email], ['Téléphone', profile.phone], ['Ville', profile.city], ['Connexion', user.provider], ['Date', frDate()]]
      }
    }
  );
}));

exports.onCompanyRegistered = onDocumentCreated(options('companies/{uid}'), handle(async (event) => {
  const { uid } = event.params;
  const company = event.data.data();
  if (isScraped(uid, company)) return;
  const user = await contactOf(uid);
  await sendPair(
    {
      to: user.email, toName: company.contactName, tag: 'inscription-entreprise',
      subject: "Votre demande d'inscription entreprise est enregistrée",
      content: {
        title: 'Demande enregistrée',
        intro: `Bonjour ${esc(company.contactName || '')},<br><br>Nous avons bien reçu l'inscription de <strong>${esc(company.companyName)}</strong>. Notre équipe vérifie les informations de l'entreprise, généralement sous 48 heures ouvrées. Vous recevrez un e-mail dès que le compte sera validé. Vous pourrez alors publier vos missions.`,
        rows: [['Entreprise', company.companyName], ['Contact', company.contactName], ['Téléphone', company.phone], ['Ville', company.city]]
      }
    },
    {
      subject: `Entreprise à valider : ${company.companyName}`, tag: 'admin-inscription',
      replyTo: user.email ? { email: user.email } : undefined,
      content: {
        title: 'Nouvelle entreprise à valider',
        intro: "Une entreprise vient de s'inscrire. Son compte reste en attente jusqu'à votre validation.",
        rows: [['Entreprise', company.companyName], ['Contact', company.contactName], ['E-mail', user.email], ['Téléphone', company.phone], ['Ville', company.city], ['SIRET / NINEA', company.siret], ['Connexion', user.provider], ['Date', frDate()]],
        cta: { label: 'Ouvrir le tableau de bord', url: config().appUrl }
      }
    }
  );
}));

exports.onApplicationCreated = onDocumentCreated(options('applications/{id}'), handle(async (event) => {
  const application = event.data.data();
  const [user, profileSnap] = await Promise.all([
    contactOf(application.candidateId),
    db().doc(`candidateProfiles/${application.candidateId}`).get()
  ]);
  const profile = profileSnap.exists ? profileSnap.data() : {};
  await sendPair(
    {
      to: user.email, toName: application.candidateName, tag: 'candidature',
      subject: `Candidature enregistrée : ${application.missionTitle}`,
      content: {
        title: 'Votre candidature est enregistrée',
        intro: "Notre équipe étudie votre dossier. Vous serez prévenu par e-mail à chaque étape (examen, entretien, réponse de l'entreprise).",
        rows: [['Poste', application.missionTitle], ['Lieu', application.city], ['Date', frDate()]],
        cta: { label: 'Suivre mes candidatures', url: config().appUrl }
      }
    },
    {
      subject: `Nouvelle candidature : ${application.missionTitle}`, tag: 'admin-candidature',
      replyTo: user.email ? { email: user.email } : undefined,
      content: {
        title: 'Nouvelle candidature',
        intro: 'Un candidat vient de postuler.',
        rows: [
          ['Candidat', application.candidateName], ['E-mail', user.email], ['Téléphone', profile.phone],
          ['Ville du candidat', profile.city], ['Poste', application.missionTitle], ['Lieu du poste', application.city],
          ['Compétences', (profile.skills || []).join(', ')], ['Date', frDate()]
        ],
        cta: { label: 'Traiter la candidature', url: config().appUrl }
      }
    }
  );
}));

exports.onApplicationUpdated = onDocumentUpdated(options('applications/{id}'), handle(async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === after.status || after.status === 'pending') return;
  const user = await contactOf(after.candidateId);
  await sendMail({
    to: user.email, toName: after.candidateName, tag: 'candidature-statut',
    subject: `Votre candidature : ${applicationStatus[after.status] || after.status}`,
    content: {
      title: 'Votre candidature a évolué',
      intro: `Le statut de votre candidature pour <strong>${esc(after.missionTitle)}</strong> est maintenant : <strong>${esc(applicationStatus[after.status] || after.status)}</strong>.`,
      cta: { label: 'Voir le détail', url: config().appUrl }
    }
  });
}));

exports.onInterviewCreated = onDocumentCreated(options('interviews/{id}'), handle(async (event) => {
  const interview = event.data.data();
  const user = await contactOf(interview.candidateId);
  await sendMail({
    to: user.email, toName: interview.candidateName, tag: 'entretien',
    subject: `Entretien planifié : ${interview.missionTitle}`,
    content: {
      title: 'Un entretien est planifié',
      intro: 'Notre équipe souhaite échanger avec vous au sujet de votre candidature.',
      rows: [['Poste', interview.missionTitle], ['Date et heure', frDateTime(interview.scheduledAt)]],
      cta: { label: 'Ouvrir mon espace', url: config().appUrl }
    }
  });
}));

exports.onMissionCreated = onDocumentCreated(options('missions/{id}'), handle(async (event) => {
  const mission = event.data.data();
  // Only company submissions need a round trip; admin-created and imported missions are published directly.
  if (isScraped(mission.companyId, mission) || mission.status !== 'pending') return;
  const [user, terms] = await Promise.all([
    contactOf(mission.companyId),
    db().doc(`missions/${event.params.id}/private/terms`).get()
  ]);
  const pay = terms.exists ? terms.data().pay : '';
  const rows = [['Poste', mission.title], ['Secteur', mission.sector], ['Lieu', mission.city], ['Contrat', mission.contractType], ['Durée', mission.duration], ['Rémunération', pay]];
  await sendPair(
    {
      to: user.email, toName: mission.companyName, tag: 'mission',
      subject: `Mission reçue : ${mission.title}`,
      content: { title: 'Votre mission est enregistrée', intro: 'Elle sera publiée après une vérification rapide par notre équipe. Vous serez prévenu par e-mail.', rows }
    },
    {
      subject: `Mission à valider : ${mission.title} (${mission.companyName})`, tag: 'admin-mission',
      replyTo: user.email ? { email: user.email } : undefined,
      content: {
        title: 'Nouvelle mission à valider',
        intro: `<strong>${esc(mission.companyName)}</strong> a soumis une mission.`,
        rows: [['Entreprise', mission.companyName], ['E-mail', user.email], ...rows, ['Description', mission.description]],
        cta: { label: 'Valider la mission', url: config().appUrl }
      }
    }
  );
}));

exports.onMissionUpdated = onDocumentUpdated(options('missions/{id}'), handle(async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === after.status || isScraped(after.companyId, after)) return;
  const user = await contactOf(after.companyId);
  await sendMail({
    to: user.email, toName: after.companyName, tag: 'mission-statut',
    subject: `Votre mission ${after.title} : ${missionStatus[after.status] || after.status}`,
    content: {
      title: 'Statut de votre mission',
      intro: `La mission <strong>${esc(after.title)}</strong> est maintenant : <strong>${esc(missionStatus[after.status] || after.status)}</strong>.`,
      cta: { label: 'Voir mes missions', url: config().appUrl }
    }
  });
}));

exports.onCompanyUpdated = onDocumentUpdated(options('companies/{uid}'), handle(async (event) => {
  const { uid } = event.params;
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === after.status || isScraped(uid, after) || !['active', 'rejected'].includes(after.status)) return;
  const user = await contactOf(uid);
  const approved = after.status === 'active';
  await sendMail({
    to: user.email, toName: after.contactName, tag: 'entreprise-statut',
    subject: approved ? 'Votre compte entreprise est validé' : 'Votre demande de compte entreprise',
    content: {
      title: approved ? 'Compte validé' : 'Demande non validée',
      intro: approved
        ? `Le compte de <strong>${esc(after.companyName)}</strong> est validé. Vous pouvez dès maintenant publier vos missions.`
        : `Nous n'avons pas pu valider le compte de <strong>${esc(after.companyName)}</strong>. Répondez à cet e-mail ou utilisez le formulaire de contact si vous pensez qu'il s'agit d'une erreur.`,
      ...(approved ? { cta: { label: 'Publier une mission', url: config().appUrl } } : {})
    }
  });
}));

exports.onContactMessage = onDocumentCreated(options('contactMessages/{id}'), handle(async (event) => {
  const message = event.data.data();
  const topics = { candidate: 'Candidat', company: 'Entreprise', other: 'Autre' };
  await sendPair(
    {
      to: message.email, toName: message.name, tag: 'contact',
      subject: 'Nous avons bien reçu votre message',
      content: {
        title: 'Message reçu',
        intro: `Bonjour ${esc(message.name)},<br><br>Merci pour votre message. Notre équipe vous répond sous 2 jours ouvrés. Voici une copie de votre demande.`,
        rows: [['Objet', message.subject], ['Message', message.message]]
      }
    },
    {
      subject: `Contact : ${message.subject}`, tag: 'admin-contact',
      replyTo: { email: message.email, name: message.name },
      content: {
        title: 'Nouveau message de contact',
        intro: 'Répondez directement à cet e-mail pour écrire à l\'expéditeur.',
        rows: [['Nom', message.name], ['E-mail', message.email], ['Téléphone', message.phone], ['Profil', topics[message.topic] || message.topic], ['Objet', message.subject], ['Message', message.message], ['Date', frDate()]]
      }
    }
  );
}));

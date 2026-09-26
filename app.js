import {
  applyToMission, auth, countPublishedMissions, createAccountProfile, createInterview, createMission, createProposal,
  getDocumentsForCandidate, getSessionProfile, loadAcceptedProposals, loadMorePage, loadMorePublicMissions,
  loadPublicMissions, loadWorkspace, login, logout,
  onAuthStateChanged, register, resetPassword, respondToProposal, saveCandidateProfile,
  saveCompanyProfile, signInWithGoogle, submitContactMessage, updateApplication, updateCompanyStatus, updateMissionStatus,
  uploadStorageDocument, uploadCloudinaryDocument
} from './firebase.js';
import {
  createFollowUp, createPlacement, endPlacement, generateInvoiceAndPayment,
  loadFollowUps, loadMoreTimesheets, loadTimesheetsWorkspace, loadWorkflowWorkspace, resubmitTimesheet,
  respondToTimesheet, submitTimesheet, updateInvoiceStatus, updatePaymentStatus
} from './workflow.js';
import {
  createChatGrant, ensureAdminCandidateConversation, ensureAdminCompanyConversation, ensureCandidateCompanyConversation,
  markConversationRead, sendMessage, subscribeConversations, subscribeMessages
} from './messaging.js';

const icons = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18M6 21V4h12v17M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-5h4v5"/></svg>',
  bell: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM14 21h-4"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  map: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></svg>',
  money: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="8" width="20" height="12" rx="2"/><circle cx="12" cy="14" r="3"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  google: '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>'
};

const SCRAPE_TTL_DAYS = 5;

const SECTORS = [
  'BTP / Construction', 'Transport / Logistique', 'Industrie / Production',
  'Tertiaire / Commerce', 'Santé / Social', 'Informatique / Numérique',
  'Hôtellerie / Restauration', 'Agriculture / Agroalimentaire',
  'Éducation / Formation', 'Finance / Comptabilité', 'Autre'
];

const DOC_TYPES = { cv: 'CV', identity: "Pièce d'identité", certificate: 'Certificat / diplôme', other: 'Autre document' };

const state = {
  session: null,
  workspace: { missions: [], applications: [], profiles: [], companies: [], proposals: [], interviews: [] },
  workflowSpace: { placements: [], timesheets: [], invoices: [], payments: [], pagination: {} },
  acceptedProposals: [],
  chat: { conversations: [], activeId: null, messages: [], unsubConversations: null, unsubMessages: null, loading: false },
  facturationTab: 'invoices', timesheetStatusFilter: 'validated',
  page: 'dashboard', query: '', filter: 'all', sectorFilter: 'all', authMode: 'login', loading: true, driveConnected: null,
  infoPage: null, authRole: 'candidate', onboardingUser: null, registering: false, contactSent: null,
  guestPage: 'missions', publicMissions: [], publicPagination: {}, publicTotal: null,
  publicQuery: '', publicCity: '', publicSector: 'all', publicContract: 'all', pendingApplyMissionId: null
};

const LEGAL_CONTENT = {
  mentions: {
    title: 'Mentions légales',
    body: `
      <h2>Éditeur du site</h2>
      <p>Le site Interim est édité par <strong>[Raison sociale / nom de l'auto-entrepreneur à compléter]</strong>, immatriculé sous le numéro NINEA/RCCM <strong>[à compléter]</strong>, dont le siège est situé <strong>[adresse à compléter, Sénégal]</strong>. Contact : <strong>[email de contact à compléter]</strong>.</p>
      <h2>Directeur de la publication</h2>
      <p><strong>[Nom du responsable à compléter]</strong>.</p>
      <h2>Hébergement</h2>
      <p>Le site est hébergé par Google Ireland Limited (Firebase Hosting), Gordon House, Barrow Street, Dublin 4, Irlande. Les documents candidats sont hébergés par Cloudinary Ltd. Les e-mails transactionnels sont envoyés par Brevo (Sendinblue SAS), 106 boulevard Haussmann, 75008 Paris, France.</p>
      <h2>Propriété intellectuelle</h2>
      <p>L'ensemble des contenus du site (textes, structure, identité visuelle) est protégé. Les offres de mission importées automatiquement depuis des sites tiers restent la propriété de leurs éditeurs respectifs et sont reproduites à titre informatif, avec un lien vers la source d'origine.</p>`
  },
  privacy: {
    title: 'Politique de confidentialité',
    body: `
      <h2>Responsable du traitement</h2>
      <p><strong>[Raison sociale à compléter]</strong> est responsable du traitement des données personnelles collectées sur cette plateforme.</p>
      <h2>Données collectées</h2>
      <p>Selon votre profil : identité et coordonnées (nom, téléphone, ville, email), informations professionnelles (compétences, expérience, disponibilité), documents (CV, pièce d'identité, certificats), informations sur l'entreprise (raison sociale, SIRET, contact).</p>
      <h2>Finalités</h2>
      <p>Mise en relation entre candidats et entreprises, qualification des candidatures par l'équipe Interim, gestion des comptes, envoi de notifications relatives au suivi de vos candidatures, missions ou entretiens.</p>
      <h2>Destinataires et sous-traitants</h2>
      <p>Vos données sont hébergées par Firebase/Google (authentification et base de données), vos documents par Cloudinary, et les e-mails de confirmation et de notification sont envoyés via Brevo. Si vous vous connectez avec Google, nous recevons uniquement votre nom et votre adresse e-mail. Aucune donnée n'est vendue à des tiers. Votre identité complète n'est jamais communiquée à une entreprise sans votre candidature explicite ; seules des informations anonymisées sont partagées lors de la présentation d'un profil.</p>
      <h2>Durée de conservation</h2>
      <p>Vos données sont conservées le temps de votre inscription sur la plateforme, puis archivées ou supprimées conformément à la réglementation applicable après clôture du compte.</p>
      <h2>Vos droits</h2>
      <p>Vous disposez d'un droit d'accès, de rectification, de suppression et d'opposition sur vos données personnelles. Pour l'exercer, contactez <strong>[email de contact à compléter]</strong>.</p>
      <h2>Cookies et stockage local</h2>
      <p>Le site utilise uniquement le stockage nécessaire à l'authentification (session Firebase Auth). Aucun cookie publicitaire ou de traçage tiers n'est utilisé.</p>`
  },
  terms: {
    title: 'Conditions générales d\'utilisation',
    body: `
      <h2>Objet</h2>
      <p>Les présentes CGU régissent l'accès et l'utilisation de la plateforme Interim, service de mise en relation entre candidats, entreprises et missions d'intérim au Sénégal.</p>
      <h2>Accès au service et comptes</h2>
      <p>La consultation des offres est libre. Postuler, publier une mission ou accéder à un espace personnel nécessite un compte candidat ou entreprise, créé avec une adresse e-mail ou un compte Google. Les comptes entreprise sont soumis à validation par un administrateur avant de pouvoir publier des missions. Les comptes administrateur ne sont pas ouverts à l'auto-inscription.</p>
      <h2>Rôle d'intermédiaire</h2>
      <p>L'équipe Interim qualifie les candidatures et présente les profils pertinents aux entreprises de manière anonymisée. La plateforme ne garantit ni l'obtention d'une mission par un candidat, ni le recrutement d'un profil par une entreprise.</p>
      <h2>Missions importées automatiquement</h2>
      <p>Certaines missions affichées (marquées "Importée") proviennent de sites d'emploi tiers, collectées automatiquement à titre informatif. Interim n'est pas partie à ces offres ; les candidats sont invités à vérifier les informations directement auprès de la source indiquée.</p>
      <h2>Obligations de l'utilisateur</h2>
      <p>Chaque utilisateur s'engage à fournir des informations exactes et à jour, à ne pas usurper l'identité d'un tiers et à ne pas détourner le service à des fins autres que le recrutement.</p>
      <h2>Responsabilité</h2>
      <p>Interim met en œuvre les moyens raisonnables pour assurer la disponibilité et la sécurité du service, sans garantie de résultat. La responsabilité d'Interim ne saurait être engagée en cas d'information erronée fournie par un utilisateur ou une source tierce.</p>
      <h2>Résiliation</h2>
      <p>Tout utilisateur peut demander la suppression de son compte à tout moment. Interim se réserve le droit de suspendre un compte en cas de non-respect des présentes CGU.</p>
      <h2>Droit applicable</h2>
      <p>Les présentes CGU sont soumises au droit sénégalais. Pour toute question, contactez <strong>[email de contact à compléter]</strong>.</p>`
  }
};

const nav = {
  admin: [
    ['dashboard', 'grid', 'Vue d\'ensemble'],
    ['missions', 'briefcase', 'Missions'],
    ['applications', 'users', 'Candidatures'],
    ['candidates', 'user', 'Candidats'],
    ['companies', 'building', 'Entreprises'],
    ['interviews', 'calendar', 'Entretiens'],
    ['placements', 'check', 'Placements'],
    ['facturation', 'money', 'Facturation'],
    ['messages', 'chat', 'Messages']
  ],
  candidate: [
    ['dashboard', 'grid', 'Vue d\'ensemble'],
    ['missions', 'search', 'Trouver une mission'],
    ['applications', 'file', 'Mes candidatures'],
    ['placements', 'check', 'Mes placements'],
    ['messages', 'chat', 'Messages'],
    ['profile', 'user', 'Mon profil']
  ],
  company: [
    ['dashboard', 'grid', 'Vue d\'ensemble'],
    ['missions', 'briefcase', 'Mes missions'],
    ['proposals', 'users', 'Profils proposés'],
    ['placements', 'check', 'Placements'],
    ['facturation', 'money', 'Factures'],
    ['messages', 'chat', 'Messages'],
    ['profile', 'building', 'Mon entreprise']
  ]
};

const missionStatus = { pending: 'À valider', published: 'Publiée', suspended: 'Suspendue', closed: 'Clôturée' };
const applicationStatus = { pending: 'En attente', reviewing: 'En cours d\'examen', interview: 'Entretien prévu', presented: 'Présenté au client', accepted: 'Accepté', rejected: 'Refusé' };
const proposalStatus = { pending: 'Réponse attendue', accepted: 'Accepté', rejected: 'Refusé' };
const placementStatus = { active: 'Actif', ended: 'Terminé' };
const timesheetStatus = { submitted: 'Soumise', validated: 'Validée', disputed: 'Contestée', locked: 'Verrouillée' };
const invoiceStatus = { draft: 'Brouillon', sent: 'Envoyée', paid: 'Payée' };
const paymentStatus = { pending: 'En attente', paid: 'Payé' };
const endReasonLabel = { completed: 'Mission terminée normalement', candidate: 'Rompu par le candidat', company: 'Rompu par l\'entreprise', other: 'Autre' };

const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
const dateText = (value) => value?.toDate ? value.toDate().toLocaleDateString('fr-FR') : 'Aujourd\'hui';
const label = (map, value) => map[value] || value || 'Non renseigné';
const profileScore = (p = {}) => {
  const fields = [p.name, p.phone, p.city, p.skills?.length, p.experience, p.availability];
  return Math.round(fields.filter(Boolean).length / fields.length * 100);
};

function toast(message, error = false) {
  const item = document.createElement('div');
  item.className = `toast${error ? ' toast-error' : ''}`;
  item.textContent = message;
  document.querySelector('#toast-root').appendChild(item);
  setTimeout(() => item.remove(), 3800);
}

function errorMessage(error) {
  const messages = {
    'auth/invalid-credential': 'Adresse e-mail ou mot de passe incorrect.',
    'auth/email-already-in-use': 'Un compte existe déjà avec cette adresse. Connectez-vous, ou utilisez « Continuer avec Google » si vous vous êtes inscrit ainsi.',
    'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
    'auth/invalid-email': 'Adresse e-mail invalide.',
    'auth/missing-password': 'Saisissez votre mot de passe.',
    'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.',
    'auth/network-request-failed': 'Connexion internet indisponible. Vérifiez votre réseau.',
    'auth/account-exists-with-different-credential': 'Un compte existe déjà avec cette adresse. Connectez-vous avec votre mot de passe.',
    'auth/popup-blocked': 'La fenêtre Google a été bloquée par le navigateur. Autorisez les fenêtres pop-up pour ce site.',
    'auth/operation-not-allowed': "La connexion Google n'est pas encore activée sur la plateforme.",
    'auth/unauthorized-domain': "Ce domaine n'est pas autorisé pour la connexion Google.",
    'permission-denied': 'Action refusée par les règles de sécurité Firebase.'
  };
  return messages[error.code] || error.message || 'Une erreur est survenue.';
}

function loadMoreButton(kind, label = 'Charger plus') {
  if (!state.workspace.pagination?.[kind]?.hasMore) return '';
  return `<div class="load-more"><button class="btn btn-light btn-small" data-load-more="${kind}">${label}</button></div>`;
}

// ── Site public : en-tête, pied de page, offres, authentification, contact ──

const INFO_PAGES = ['contact', 'mentions', 'privacy', 'terms'];

const logo = `<span class="logo-mark" aria-hidden="true"><svg viewBox="0 0 28 28" width="28" height="28"><rect width="28" height="28" rx="6" fill="currentColor"/><circle cx="14" cy="8" r="2.4" fill="#fff"/><rect x="11.8" y="12" width="4.4" height="10" rx="1.2" fill="#fff"/></svg></span><span class="logo-text">interim</span>`;

const longDate = (value) => value?.toDate ? value.toDate().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const shortDate = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('/') : (iso || '');
const period = (start, end) => `${esc(shortDate(start))} au ${esc(shortDate(end))}`;
const payText = (mission) => mission.pay ? esc(mission.pay) : 'Rémunération non précisée';
const durationText = (mission) => mission.duration && !/^non pr[ée]cis[ée]e?$/i.test(mission.duration.trim()) ? `, ${esc(mission.duration)}` : '';
const sectorTag = (mission) => mission.sector && mission.sector !== 'Autre' ? `<span class="tag">${esc(mission.sector)}</span>` : '';

function publicHeader(active = '') {
  const s = state.session;
  const account = s
    ? `<button class="header-account" data-nav="app">${icons.user}<span>${esc(s.displayName || 'Mon espace')}</span></button>`
    : `<button class="header-account" data-nav="auth" data-auth-mode="login">${icons.user}<span>Mon compte</span></button>`;
  const link = (target, text, extra = '') => `<button class="${active === target ? 'active' : ''}" data-nav="${target}" ${extra}>${text}</button>`;
  return `<header class="site-header">
    <div class="utility-bar"><div class="container">
      <button data-nav="auth" data-auth-mode="register" data-auth-role="company">Espace recruteur</button>
      <button data-nav="contact">Contact</button>
    </div></div>
    <div class="container header-main">
      <a class="logo" href="/" data-nav="missions" aria-label="Interim, accueil">${logo}</a>
      <nav class="site-nav" id="site-nav" aria-label="Navigation principale">
        ${link('missions', "Offres d'emploi")}
        ${link('candidates', 'Candidats', 'data-auth-role="candidate"')}
        ${link('recruiters', 'Recruteurs', 'data-auth-role="company"')}
        ${link('contact', 'Contact')}
      </nav>
      <div class="header-actions">${account}<button class="menu-toggle" id="menu-toggle" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="site-nav">${icons.menu}</button></div>
    </div>
  </header>`;
}

function publicFooter() {
  const year = new Date().getFullYear();
  return `<footer class="site-footer"><div class="container">
    <div class="footer-cols">
      <div><h3>Candidats</h3><button data-nav="missions">Toutes les offres</button><button data-nav="auth" data-auth-mode="register" data-auth-role="candidate">Créer un compte candidat</button><button data-nav="auth" data-auth-mode="login">Se connecter</button></div>
      <div><h3>Recruteurs</h3><button data-nav="auth" data-auth-mode="register" data-auth-role="company">Créer un compte entreprise</button><button data-nav="contact">Nous confier un recrutement</button></div>
      <div><h3>Interim</h3><button data-nav="contact">Contact</button><button data-nav="mentions">Mentions légales</button><button data-nav="privacy">Confidentialité</button><button data-nav="terms">CGU</button></div>
    </div>
    <div class="footer-bottom"><span>&copy; ${year} Interim. Recrutement et intérim au Sénégal.</span></div>
  </div></footer>`;
}

function breadcrumb(current) {
  return `<nav class="breadcrumb" aria-label="Fil d'Ariane"><button data-nav="missions">Accueil</button>${icons.chevronRight}<span aria-current="page">${esc(current)}</span></nav>`;
}

function publicFilters() {
  const q = state.publicQuery.trim().toLowerCase();
  const city = state.publicCity.trim().toLowerCase();
  return state.publicMissions.filter((m) =>
    (!q || `${m.title} ${m.sector} ${m.description}`.toLowerCase().includes(q)) &&
    (!city || (m.city || '').toLowerCase().includes(city)) &&
    (state.publicSector === 'all' || m.sector === state.publicSector) &&
    (state.publicContract === 'all' || m.contractType === state.publicContract)
  );
}

const publicFiltered = () => Boolean(state.publicQuery.trim() || state.publicCity.trim() || state.publicSector !== 'all' || state.publicContract !== 'all');

function publicCountLabel(count) {
  return `${count} offre${count > 1 ? 's' : ''}`;
}

function jobCard(mission, footAction = '') {
  return `<article class="job-card">
    <h3><button class="job-title" data-job="${mission.id}">${esc(mission.title)}</button></h3>
    <ul class="job-meta">
      <li>${icons.map}<span>${esc(mission.city || 'Lieu non précisé')}</span></li>
      <li>${icons.briefcase}<span>${esc(mission.contractType || 'Contrat non précisé')}${durationText(mission)}</span></li>
      <li>${icons.money}<span>${payText(mission)}</span></li>
    </ul>
    <div class="job-foot"><span>${mission.createdAt ? `Publiée le ${longDate(mission.createdAt)}` : 'Publiée récemment'}</span>${footAction}</div>
  </article>`;
}

function publicResults() {
  const visible = publicFilters();
  const loaded = state.publicMissions.length;
  const total = state.publicTotal ?? loaded;
  const progress = total ? Math.min(100, Math.round(loaded / total * 100)) : 100;
  const pager = !publicFiltered() && loaded
    ? `<div class="pager"><div class="pager-bar"><span style="width:${progress}%"></span></div><p>${loaded} sur ${total} offres</p>${state.publicPagination?.hasMore ? '<button class="btn btn-outline" data-load-more-public>Afficher plus d\'offres</button>' : ''}</div>`
    : (publicFiltered() && state.publicPagination?.hasMore ? '<div class="pager"><p>La recherche porte sur les offres déjà chargées.</p><button class="btn btn-outline" data-load-more-public>Charger plus d\'offres</button></div>' : '');
  if (!visible.length) {
    return `<div class="empty-state"><h3>Aucune offre ne correspond à votre recherche</h3><p>Essayez un autre métier, une autre ville, ou retirez un filtre.</p>${publicFiltered() ? '<button class="btn btn-outline" id="public-reset">Effacer les filtres</button>' : ''}</div>${pager}`;
  }
  return `<div class="job-grid">${visible.map((m) => jobCard(m, sectorTag(m))).join('')}</div>${pager}`;
}

function publicResultsTitle() {
  if (publicFiltered()) return `${publicCountLabel(publicFilters().length)} pour votre recherche`;
  const total = state.publicTotal ?? state.publicMissions.length;
  return `${total} offre${total > 1 ? 's' : ''} d'emploi`;
}

function refreshPublicResults() {
  const zone = document.querySelector('#public-results');
  if (!zone) return;
  zone.innerHTML = publicResults();
  document.querySelector('#results-title').textContent = publicResultsTitle();
  const count = publicFiltered() ? publicFilters().length : (state.publicTotal ?? state.publicMissions.length);
  document.querySelector('#public-count-btn').textContent = `Voir ${publicCountLabel(count)}`;
  bindPublicResults();
}

function publicMissionsScreen() {
  const sectorOpts = SECTORS.map((s) => `<option value="${esc(s)}" ${state.publicSector === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
  const contracts = [...new Set(state.publicMissions.map((m) => m.contractType).filter(Boolean))].sort();
  const contractOpts = contracts.map((c) => `<option value="${esc(c)}" ${state.publicContract === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const bySector = SECTORS.map((s) => [s, state.publicMissions.filter((m) => m.sector === s).length]).filter(([, n]) => n);
  const count = publicFiltered() ? publicFilters().length : (state.publicTotal ?? state.publicMissions.length);
  return `${publicHeader('missions')}
  <section class="search-hero"><div class="container">
    ${breadcrumb("Offres d'emploi")}
    <h1>Offres d'emploi et missions d'intérim</h1>
    <form class="search-bar" id="public-search-form" role="search">
      <label class="search-field"><span class="sr-only">Métier ou mot-clé</span>${icons.search}<input id="public-search" value="${esc(state.publicQuery)}" placeholder="Métier, mot-clé" autocomplete="off"></label>
      <label class="search-field"><span class="sr-only">Ville</span>${icons.map}<input id="public-city" value="${esc(state.publicCity)}" placeholder="Ville" autocomplete="off"></label>
      <label class="search-field select-field"><span class="sr-only">Secteur</span><select id="public-sector-filter"><option value="all">Tous les secteurs</option>${sectorOpts}</select>${icons.chevronDown}</label>
      <button class="btn btn-primary btn-lg" id="public-count-btn">Voir ${publicCountLabel(count)}</button>
    </form>
  </div></section>
  <main class="results" id="results"><div class="container">
    <div class="results-head">
      <h2 id="results-title">${publicResultsTitle()}</h2>
      <label class="inline-select">Type de contrat<select id="public-contract"><option value="all">Tous</option>${contractOpts}</select></label>
    </div>
    <div id="public-results">${publicResults()}</div>
  </div></main>
  ${bySector.length ? `<section class="browse"><div class="container"><h2>Parcourir les offres par secteur</h2><div class="sector-grid">${bySector.map(([s, n]) => `<button data-sector-link="${esc(s)}"><span>${esc(s)}</span><small>${n} offre${n > 1 ? 's' : ''}</small></button>`).join('')}</div></div></section>` : ''}
  <section class="recruit-band"><div class="container">
    <div><h2>Vous recrutez ?</h2><p>Publiez vos besoins en intérim ou en CDD. Notre équipe présélectionne les candidats et vous présente des profils vérifiés.</p></div>
    <div class="row"><button class="btn btn-white" data-nav="auth" data-auth-mode="register" data-auth-role="company">Créer un compte entreprise</button><button class="btn btn-ghost-light" data-nav="contact">Nous contacter</button></div>
  </div></section>
  ${publicFooter()}`;
}

function jobModal(mission) {
  const s = state.session;
  const applied = s?.role === 'candidate' && state.workspace.applications.some((a) => a.missionId === mission.id);
  let action = `<button class="btn btn-primary" data-job-apply="${mission.id}">Postuler</button>`;
  if (applied) action = '<button class="btn btn-primary" disabled>Candidature envoyée</button>';
  else if (s && s.role !== 'candidate') action = '';
  modal(`<div class="modal-head"><div><h2>${esc(mission.title)}</h2><p>Entreprise confidentielle${mission.sector ? `, ${esc(mission.sector)}` : ''}</p></div><button class="close" data-close aria-label="Fermer">${icons.x}</button></div>
    <ul class="job-meta job-meta-inline">
      <li>${icons.map}<span>${esc(mission.city || 'Lieu non précisé')}</span></li>
      <li>${icons.briefcase}<span>${esc(mission.contractType || 'Contrat non précisé')}${durationText(mission)}</span></li>
      <li>${icons.money}<span>${payText(mission)}</span></li>
    </ul>
    <div class="section-label">Description du poste</div>
    <p class="job-description">${esc(mission.description || 'Description non fournie.')}</p>
    ${mission.source ? `<p class="muted-block">Offre importée d'un site partenaire.${mission.sourceUrl ? ` <a class="text-link" href="${esc(mission.sourceUrl)}" target="_blank" rel="noopener">Consulter la source</a>` : ''}</p>` : ''}
    <div class="modal-actions"><button type="button" class="btn btn-light" data-close>Fermer</button>${action}</div>`);
  document.querySelector('[data-job-apply]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!state.session) {
      closeModal();
      state.pendingApplyMissionId = mission.id;
      go('auth', { authMode: 'register', authRole: 'candidate' });
      return;
    }
    button.disabled = true;
    try { await applyToMission(state.session, mission); closeModal(); await refresh('Candidature envoyée. Un e-mail de confirmation vous a été adressé.'); }
    catch (error) { toast(errorMessage(error), true); button.disabled = false; }
  });
}

function roleChoice(selected) {
  const option = (value, title, text) => `<label class="role-option"><input type="radio" name="role" value="${value}" ${selected === value ? 'checked' : ''}><span><strong>${title}</strong><small>${text}</small></span></label>`;
  return `<fieldset class="role-choice full"><legend>Vous êtes</legend>${option('candidate', 'Candidat', 'Je cherche une mission')}${option('company', 'Entreprise', 'Je recrute')}</fieldset>`;
}

function profileFields(values = {}, role = 'candidate') {
  const company = role === 'company';
  return `${roleChoice(role)}
    <div class="field full company-only" ${company ? '' : 'hidden'}><label for="f-company">Nom de l'entreprise</label><input id="f-company" name="companyName" value="${esc(values.companyName || '')}" autocomplete="organization" ${company ? 'required' : ''}></div>
    <div class="field"><label for="f-name"><span class="company-only" ${company ? '' : 'hidden'}>Nom du contact</span><span class="candidate-only" ${company ? 'hidden' : ''}>Nom et prénom</span></label><input id="f-name" name="name" value="${esc(values.name || '')}" autocomplete="name" required></div>
    <div class="field"><label for="f-phone">Téléphone</label><input id="f-phone" name="phone" type="tel" value="${esc(values.phone || '')}" placeholder="77 123 45 67" autocomplete="tel" required></div>
    <div class="field"><label for="f-city">Ville</label><input id="f-city" name="city" value="${esc(values.city || '')}" placeholder="Dakar" autocomplete="address-level2" required></div>
    <div class="field company-only" ${company ? '' : 'hidden'}><label for="f-siret">NINEA ou SIRET <span class="optional">(facultatif)</span></label><input id="f-siret" name="siret" value="${esc(values.siret || '')}"></div>`;
}

function authScreen() {
  const reg = state.authMode === 'register';
  const applyHint = state.pendingApplyMissionId ? `<div class="notice">Connectez-vous ou créez votre compte candidat pour envoyer votre candidature.</div>` : '';
  return `${publicHeader(state.authRole === 'company' && reg ? 'recruiters' : state.authRole === 'candidate' && reg ? 'candidates' : '')}
  <main class="auth-page"><div class="container auth-layout">
    <section class="panel auth-card">
      <div class="auth-tabs" role="tablist">
        <button role="tab" aria-selected="${!reg}" class="${reg ? '' : 'active'}" data-auth-tab="login">Se connecter</button>
        <button role="tab" aria-selected="${reg}" class="${reg ? 'active' : ''}" data-auth-tab="register">Créer un compte</button>
      </div>
      ${applyHint}
      <button type="button" class="btn btn-google" id="google-signin">${icons.google}<span>Continuer avec Google</span></button>
      <div class="divider"><span>ou avec votre adresse e-mail</span></div>
      <form id="auth-form" class="form-grid">
        ${reg ? profileFields({}, state.authRole) : ''}
        <div class="field full"><label for="f-email">Adresse e-mail</label><input id="f-email" name="email" type="email" autocomplete="email" placeholder="nom@exemple.com" required></div>
        <div class="field full"><label for="f-password">Mot de passe</label><input id="f-password" name="password" type="password" minlength="6" autocomplete="${reg ? 'new-password' : 'current-password'}" required>${reg ? '<small class="hint">6 caractères minimum.</small>' : ''}</div>
        <div class="form-error full" id="auth-error" role="alert" hidden></div>
        <button class="btn btn-primary btn-block full submit-btn">${reg ? 'Créer mon compte' : 'Se connecter'}</button>
      </form>
      ${reg ? '<p class="fine-print">En créant un compte, vous acceptez les <button class="text-link" data-nav="terms">conditions d\'utilisation</button> et la <button class="text-link" data-nav="privacy">politique de confidentialité</button>.</p>' : '<button class="text-link auth-reset" id="reset-password">Mot de passe oublié ?</button>'}
    </section>
    <aside class="auth-aside">
      <h2>Votre espace Interim</h2>
      <ul class="check-list">
        <li>${icons.check}<span>Suivez vos candidatures et vos entretiens</span></li>
        <li>${icons.check}<span>Déclarez vos heures et consultez vos paiements</span></li>
        <li>${icons.check}<span>Échangez avec notre équipe depuis la messagerie</span></li>
      </ul>
      <p>Les comptes entreprise sont activés après vérification par notre équipe, en général sous 48 heures ouvrées.</p>
    </aside>
  </div></main>
  ${publicFooter()}`;
}

function onboardingScreen() {
  const u = state.onboardingUser;
  return `${publicHeader()}
  <main class="auth-page"><div class="container auth-layout auth-layout-single">
    <section class="panel auth-card">
      <h1 class="auth-title">Finaliser votre inscription</h1>
      <p class="auth-sub">Vous êtes connecté avec <strong>${esc(u.email)}</strong>. Il nous manque quelques informations pour créer votre espace.</p>
      <form id="onboarding-form" class="form-grid">
        ${profileFields({ name: u.displayName }, state.authRole)}
        <div class="form-error full" id="auth-error" role="alert" hidden></div>
        <button class="btn btn-primary btn-block full submit-btn">Créer mon espace</button>
      </form>
      <p class="fine-print">Ce n'est pas vous ? <button class="text-link" id="onboarding-cancel">Utiliser un autre compte</button></p>
    </section>
  </div></main>
  ${publicFooter()}`;
}

function contactScreen() {
  const s = state.session;
  const sent = state.contactSent;
  const topic = s?.role === 'company' ? 'company' : s?.role === 'candidate' ? 'candidate' : 'other';
  const form = sent
    ? `<div class="success-state">${icons.check}<div><h2>Message envoyé</h2><p>Merci. Une copie de votre message a été envoyée à <strong>${esc(sent)}</strong>. Nous vous répondons sous 2 jours ouvrés.</p><button class="btn btn-outline" id="contact-again">Envoyer un autre message</button></div></div>`
    : `<form id="contact-form" class="form-grid" novalidate>
        <div class="field"><label for="c-name">Nom et prénom</label><input id="c-name" name="name" value="${esc(s?.displayName || '')}" autocomplete="name" required minlength="2" maxlength="120"></div>
        <div class="field"><label for="c-email">Adresse e-mail</label><input id="c-email" name="email" type="email" value="${esc(s?.email || '')}" autocomplete="email" placeholder="nom@exemple.com" required maxlength="200"></div>
        <div class="field"><label for="c-phone">Téléphone <span class="optional">(facultatif)</span></label><input id="c-phone" name="phone" type="tel" autocomplete="tel" maxlength="40"></div>
        <div class="field"><label for="c-topic">Vous êtes</label><select id="c-topic" name="topic"><option value="candidate" ${topic === 'candidate' ? 'selected' : ''}>Candidat</option><option value="company" ${topic === 'company' ? 'selected' : ''}>Entreprise</option><option value="other" ${topic === 'other' ? 'selected' : ''}>Autre</option></select></div>
        <div class="field full"><label for="c-subject">Objet</label><input id="c-subject" name="subject" required minlength="3" maxlength="150" placeholder="Ex. : question sur une candidature"></div>
        <div class="field full"><label for="c-message">Message</label><textarea id="c-message" name="message" rows="6" required minlength="10" maxlength="4000"></textarea></div>
        <div class="hp-field" aria-hidden="true"><label for="c-website">Ne pas remplir</label><input id="c-website" name="website" tabindex="-1" autocomplete="off"></div>
        <div class="form-error full" id="contact-error" role="alert" hidden></div>
        <p class="fine-print full">Vos informations servent uniquement à traiter votre demande. <button type="button" class="text-link" data-nav="privacy">Politique de confidentialité</button></p>
        <div class="full"><button class="btn btn-primary submit-btn">Envoyer le message</button></div>
      </form>`;
  return `${publicHeader('contact')}
  <section class="page-hero"><div class="container">${breadcrumb('Contact')}<h1>Contactez-nous</h1><p>Une question sur une offre, votre inscription ou un besoin de recrutement ? Écrivez-nous, nous répondons sous 2 jours ouvrés.</p></div></section>
  <main class="container contact-layout">
    <section class="panel">${form}</section>
    <aside class="contact-aside">
      <div class="panel"><h3>Vous cherchez une mission</h3><p>Créez votre compte candidat, complétez votre profil et déposez votre CV. Vous pourrez postuler en un clic.</p><button class="btn btn-outline" data-nav="auth" data-auth-mode="register" data-auth-role="candidate">Créer un compte candidat</button></div>
      <div class="panel"><h3>Vous recrutez</h3><p>Ouvrez un compte entreprise pour publier vos missions et recevoir des profils présélectionnés.</p><button class="btn btn-outline" data-nav="auth" data-auth-mode="register" data-auth-role="company">Créer un compte entreprise</button></div>
    </aside>
  </main>
  ${publicFooter()}`;
}

function legalPageView() {
  const entry = LEGAL_CONTENT[state.infoPage] || LEGAL_CONTENT.mentions;
  return `${publicHeader()}
  <section class="page-hero"><div class="container">${breadcrumb(entry.title)}<h1>${esc(entry.title)}</h1></div></section>
  <main class="container legal-layout"><article class="panel legal-body">${entry.body}</article></main>
  ${publicFooter()}`;
}

function loadingScreen() {
  return `<div class="loading-screen"><span class="logo">${logo}</span><div class="spinner" role="status" aria-label="Chargement"></div></div>`;
}

// Single navigation entry point for the public site and its links from the app.
function go(target, { authMode, authRole } = {}) {
  closeModal();
  if (target === 'candidates' || target === 'recruiters') {
    authMode = 'register';
    authRole = target === 'candidates' ? 'candidate' : 'company';
    target = 'auth';
  }
  if (authMode) state.authMode = authMode;
  if (authRole) state.authRole = authRole;
  if (INFO_PAGES.includes(target)) {
    state.infoPage = target;
    if (target === 'contact') state.contactSent = null;
  } else {
    state.infoPage = null;
    if (state.session) {
      state.page = target === 'missions' ? 'missions' : state.page;
    } else if (target !== 'app') {
      state.guestPage = target === 'auth' ? 'auth' : 'missions';
      if (state.guestPage === 'missions') state.pendingApplyMissionId = null;
    }
  }
  render();
  window.scrollTo(0, 0);
}

function showFormError(id, message) {
  const box = document.querySelector(id);
  if (!box) return toast(message, true);
  box.textContent = message;
  box.hidden = false;
}

function bindRoleChoice() {
  document.querySelectorAll('[name=role]').forEach((input) => input.addEventListener('change', () => {
    const company = input.value === 'company';
    state.authRole = input.value;
    document.querySelectorAll('.company-only').forEach((el) => { el.hidden = !company; });
    document.querySelectorAll('.candidate-only').forEach((el) => { el.hidden = company; });
    const companyName = document.querySelector('[name=companyName]');
    if (companyName) companyName.required = company;
  }));
}

function bindPublicResults() {
  document.querySelectorAll('[data-job]').forEach((el) => el.addEventListener('click', () => {
    const list = state.session ? state.workspace.missions : state.publicMissions;
    const mission = list.find((m) => m.id === el.dataset.job);
    if (mission) jobModal(mission);
  }));
  document.querySelector('#public-reset')?.addEventListener('click', () => {
    Object.assign(state, { publicQuery: '', publicCity: '', publicSector: 'all', publicContract: 'all' });
    render();
  });
  document.querySelector('[data-load-more-public]')?.addEventListener('click', async (e) => {
    const button = e.currentTarget;
    button.disabled = true;
    try {
      const page = await loadMorePublicMissions(state.publicPagination?.cursor);
      state.publicMissions = state.publicMissions.concat(page.rows);
      state.publicPagination = { cursor: page.cursor, hasMore: page.hasMore };
      refreshPublicResults();
    } catch (error) { toast(errorMessage(error), true); button.disabled = false; }
  });
}

function bindPublic() {
  document.querySelectorAll('[data-nav]').forEach((el) => el.addEventListener('click', (event) => {
    event.preventDefault();
    go(el.dataset.nav, { authMode: el.dataset.authMode, authRole: el.dataset.authRole });
  }));
  document.querySelector('#menu-toggle')?.addEventListener('click', (e) => {
    const nav = document.querySelector('#site-nav');
    const open = nav.classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });

  // Job board: filtering only redraws the results so typing keeps focus and caret.
  document.querySelector('#public-search')?.addEventListener('input', (e) => { state.publicQuery = e.target.value; refreshPublicResults(); });
  document.querySelector('#public-city')?.addEventListener('input', (e) => { state.publicCity = e.target.value; refreshPublicResults(); });
  document.querySelector('#public-sector-filter')?.addEventListener('change', (e) => { state.publicSector = e.target.value; refreshPublicResults(); });
  document.querySelector('#public-contract')?.addEventListener('change', (e) => { state.publicContract = e.target.value; refreshPublicResults(); });
  document.querySelector('#public-search-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    document.querySelector('#results')?.scrollIntoView({ behavior: 'smooth' });
  });
  document.querySelectorAll('[data-sector-link]').forEach((el) => el.addEventListener('click', () => {
    state.publicSector = el.dataset.sectorLink;
    render();
    document.querySelector('#results')?.scrollIntoView();
  }));
  bindPublicResults();

  // Authentication
  document.querySelectorAll('[data-auth-tab]').forEach((el) => el.addEventListener('click', () => { state.authMode = el.dataset.authTab; render(); }));
  bindRoleChoice();
  document.querySelector('#google-signin')?.addEventListener('click', async (e) => {
    const button = e.currentTarget;
    button.disabled = true;
    try { await signInWithGoogle(); }
    catch (error) {
      button.disabled = false;
      if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error.code)) showFormError('#auth-error', errorMessage(error));
    }
  });
  document.querySelector('#auth-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('.submit-btn');
    document.querySelector('#auth-error').hidden = true;
    button.disabled = true;
    const values = Object.fromEntries(new FormData(form));
    if (state.authMode === 'login') {
      try { await login(values.email, values.password); }
      catch (error) { showFormError('#auth-error', errorMessage(error)); button.disabled = false; }
      return;
    }
    // Hold the auth listener until the Firestore profile exists, then load the session once.
    state.registering = true;
    try { await register(values); }
    catch (error) { showFormError('#auth-error', errorMessage(error)); button.disabled = false; }
    finally { state.registering = false; }
    if (auth.currentUser) await loadSession(auth.currentUser);
  });
  document.querySelector('#reset-password')?.addEventListener('click', async () => {
    const email = document.querySelector('[name=email]').value.trim();
    if (!email) return showFormError('#auth-error', 'Saisissez votre adresse e-mail, puis cliquez à nouveau sur « Mot de passe oublié ».');
    try { await resetPassword(email); toast('Un lien de réinitialisation vous a été envoyé par e-mail.'); }
    catch (error) { showFormError('#auth-error', errorMessage(error)); }
  });

  // Google onboarding
  document.querySelector('#onboarding-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('.submit-btn');
    button.disabled = true;
    try {
      await createAccountProfile(auth.currentUser, Object.fromEntries(new FormData(event.currentTarget)));
      await loadSession(auth.currentUser);
    } catch (error) { showFormError('#auth-error', errorMessage(error)); button.disabled = false; }
  });
  document.querySelector('#onboarding-cancel')?.addEventListener('click', () => logout());

  // Contact
  document.querySelector('#contact-again')?.addEventListener('click', () => { state.contactSent = null; render(); });
  document.querySelector('#contact-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (values.website) return; // honeypot: bots fill every field
    const invalid = [...form.elements].find((el) => el.willValidate && !el.checkValidity());
    if (invalid) {
      invalid.focus();
      const name = form.querySelector(`label[for="${invalid.id}"]`)?.textContent.replace(/\(facultatif\)/, '').trim();
      return showFormError('#contact-error', invalid.validity.typeMismatch ? 'Adresse e-mail invalide.' : `Vérifiez le champ « ${name} ».`);
    }
    const button = form.querySelector('.submit-btn');
    button.disabled = true;
    try {
      await submitContactMessage(values);
      state.contactSent = values.email;
      render();
    } catch (error) { showFormError('#contact-error', errorMessage(error)); button.disabled = false; }
  });
}

function badge(text, tone = '') {
  if (!tone) tone = /Publi|Accept|active/i.test(text) ? 'green' : /attente|examen|valider|entretien/i.test(text) ? 'amber' : /Refus|Suspend|Clôtur/i.test(text) ? 'red' : 'blue';
  return `<span class="badge ${tone}">${esc(text)}</span>`;
}

function stat(icon, value, text) {
  return `<div class="stat"><div class="stat-icon">${icons[icon]}</div><strong>${value}</strong><span>${text}</span></div>`;
}

function shell(content) {
  const s = state.session;
  const items = nav[s.role] || [];
  const navHtml = items.map(([id, icon, text]) => `<button data-page="${id}" class="${state.page === id ? 'active' : ''}">${icons[icon]}<span>${text}</span></button>`).join('');
  const roleLabel = s.role === 'admin' ? 'Administration' : s.role === 'candidate' ? 'Espace candidat' : 'Espace entreprise';
  const pendingNotice = s.role === 'company' && s.status === 'pending' ? '<div class="notice">Votre entreprise est en cours de vérification. Vous pouvez déjà compléter votre profil ; la publication de missions sera possible après validation.</div>' : '';
  return `<div class="app-shell"><header class="app-header"><div class="app-header-inner">
      <button class="logo" data-page="dashboard" aria-label="Tableau de bord">${logo}</button>
      <div class="app-header-actions">
        <button class="header-link" data-nav="contact">Contact</button>
        <div class="user-chip"><div class="avatar" aria-hidden="true">${esc(initials(s.displayName))}</div><div><strong>${esc(s.displayName)}</strong><span>${roleLabel}</span></div></div>
      </div>
    </div></header>
    <div class="layout"><aside class="sidebar"><nav class="nav" aria-label="${roleLabel}">${navHtml}</nav>
      <div class="sidebar-foot"><div class="sidebar-legal"><button class="link" data-nav="mentions">Mentions légales</button><button class="link" data-nav="privacy">Confidentialité</button><button class="link" data-nav="terms">CGU</button></div>
      <button class="logout-btn" id="logout">${icons.logout}<span>Se déconnecter</span></button></div></aside>
    <main class="main">${pendingNotice}${content}</main></div><nav class="mobile-nav">${navHtml}<button id="logout-mobile">${icons.logout}<span>Quitter</span></button></nav></div>`;
}

function missionCard(mission) {
  const s = state.session;
  const applied = state.workspace.applications.some((a) => a.missionId === mission.id);
  let action = '';
  if (s.role === 'candidate') action = applied ? badge('Déjà candidaté', 'gray') : `<button class="btn btn-primary btn-small" data-apply="${mission.id}">Postuler</button>`;
  if (s.role === 'admin' && mission.status === 'pending') action = `<div class="row"><button class="btn btn-primary btn-small" data-mission-status="${mission.id}:published">Valider</button><button class="btn btn-light btn-small" data-mission-status="${mission.id}:suspended">Refuser</button></div>`;
  if (s.role === 'admin' && mission.status === 'published') action = `<button class="btn btn-light btn-small" data-mission-status="${mission.id}:suspended">Suspendre</button>`;
  const companyLabel = s.role === 'candidate' ? 'Entreprise confidentielle' : mission.companyName;
  const scrapedBadge = mission.source ? `<span class="badge gray" style="font-size:9px">Importée</span>` : '';
  return `<article class="mission"><div><h3>${esc(mission.title)}</h3><div class="meta"><span>${icons.building} ${esc(companyLabel)}</span><span>${icons.map} ${esc(mission.city)}</span><span>${icons.clock} ${esc(mission.contractType)} · ${esc(mission.duration)}</span><span>${icons.money} <b style="font-size:9px;font-weight:700">FCFA</b> ${esc(mission.pay)}</span>${mission.sector ? `<span class="tag">${esc(mission.sector)}</span>` : ''}</div></div><div class="mission-actions">${scrapedBadge}${badge(label(missionStatus, mission.status))}${action}</div></article>`;
}

function dashboard() {
  const s = state.session;
  const w = state.workspace;
  if (s.role === 'candidate') {
    const p = w.profile || {};
    const score = profileScore(p);
    return `<div class="page-head"><div><h1>Bonjour ${esc(s.displayName.split(' ')[0])}</h1><p>Suivez vos candidatures et découvrez les missions publiées.</p></div><button class="btn btn-primary" data-page="missions">${icons.search}<span>Voir les missions</span></button></div><section class="stats">${stat('file', w.applications.length, 'Candidatures')}${stat('calendar', w.interviews.length, 'Entretiens')}${stat('briefcase', w.missions.length, 'Missions disponibles')}${stat('user', score + '%', 'Profil complété')}</section><div class="grid-2"><section class="card"><div class="card-head"><h2>Mes candidatures récentes</h2><button class="link" data-page="applications">Voir tout</button></div>${w.applications.length ? `<div class="mission-list">${w.applications.slice(0, 4).map(applicationCard).join('')}</div>` : empty('Aucune candidature pour le moment.')}</section><aside><section class="card"><div class="card-head"><h2>Mon profil</h2><strong style="color:var(--green)">${score}%</strong></div><div class="progress"><span style="width:${score}%"></span></div><p class="muted-block">Complétez vos compétences, votre expérience et vos disponibilités pour faciliter la qualification.</p><button class="btn btn-light" data-page="profile">Compléter mon profil</button></section></aside></div>`;
  }
  if (s.role === 'company') {
    return `<div class="page-head"><div><h1>Bonjour ${esc(s.displayName)}</h1><p>Suivez les missions et les profils sélectionnés par l'administrateur.</p></div>${s.status === 'active' ? `<button class="btn btn-primary" data-modal="mission">${icons.plus}<span>Créer une mission</span></button>` : ''}</div><section class="stats">${stat('briefcase', w.missions.length, 'Missions')}${stat('users', w.proposals.length, 'Profils proposés')}${stat('clock', w.proposals.filter(p => p.response === 'pending').length, 'Réponses attendues')}${stat('check', w.proposals.filter(p => p.response === 'accepted').length, 'Profils acceptés')}</section><section class="card"><div class="card-head"><h2>Missions récentes</h2><button class="link" data-page="missions">Voir tout</button></div>${w.missions.length ? `<div class="mission-list">${w.missions.slice(0, 5).map(missionCard).join('')}</div>` : empty(s.status === 'active' ? 'Créez votre première mission.' : 'La création sera disponible après validation du compte.')}</section>`;
  }
  return `<div class="page-head"><div><h1>Vue d'ensemble</h1><p>Les éléments qui nécessitent votre intervention.</p></div><button class="btn btn-primary" data-modal="mission">${icons.plus}<span>Nouvelle mission</span></button></div><section class="stats">${stat('briefcase', w.missions.filter(m => m.status === 'pending').length, 'Missions à valider')}${stat('file', w.applications.filter(a => a.status === 'pending').length, 'Candidatures à traiter')}${stat('user', w.profiles.length, 'Candidats inscrits')}${stat('briefcase', w.missions.filter(m => m.status === 'published').length, 'Missions publiées')}</section><div class="grid-2"><section class="card"><div class="card-head"><h2>Missions à valider</h2><button class="link" data-page="missions">Voir tout</button></div>${w.missions.some(m => m.status === 'pending') ? `<div class="mission-list">${w.missions.filter(m => m.status === 'pending').slice(0, 5).map(missionCard).join('')}</div>` : empty('Aucune mission en attente.')}</section><aside><section class="card"><div class="card-head"><h2>Actions prioritaires</h2></div><div class="checklist"><button class="action-line" data-page="applications"><span>${w.applications.filter(a => a.status === 'pending').length}</span> candidatures à analyser</button><button class="action-line" data-page="candidates"><span>${w.profiles.length}</span> candidats inscrits</button><button class="action-line" data-page="companies"><span>${w.companies.filter(c => c.status === 'pending').length}</span> entreprises à valider</button><button class="action-line" data-page="missions"><span>${w.missions.filter(m => m.status === 'published').length}</span> missions publiées</button></div></section><section class="card"><div class="card-head"><h2>Documents candidats</h2>${badge('Cloudinary', 'green')}</div><p class="muted-block">Les CV et documents sont stockés sur Cloudinary. Consultez-les depuis les fiches candidats et les candidatures.</p><button class="btn btn-light" data-page="candidates">${icons.user}<span>Voir les candidats</span></button></section></aside></div>`;
}

function missionsPage() {
  const visible = state.workspace.missions.filter((m) =>
    `${m.title} ${m.city} ${m.companyName} ${m.sector}`.toLowerCase().includes(state.query.toLowerCase()) &&
    (state.filter === 'all' || m.status === state.filter) &&
    (state.sectorFilter === 'all' || m.sector === state.sectorFilter)
  );
  const canCreate = state.session.role === 'admin' || (state.session.role === 'company' && state.session.status === 'active');
  const isCandidate = state.session.role === 'candidate';
  const sectorOpts = SECTORS.map(s => `<option value="${esc(s)}" ${state.sectorFilter === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
  const statusOpts = Object.entries(missionStatus).map(([k, v]) => `<option value="${k}" ${state.filter === k ? 'selected' : ''}>${v}</option>`).join('');
  return `<div class="page-head"><div><h1>${isCandidate ? 'Trouver une mission' : 'Gestion des missions'}</h1><p>${isCandidate ? 'L\'identité de l\'entreprise reste confidentielle pendant la sélection.' : 'Créez et suivez chaque besoin de recrutement.'}</p></div>${canCreate ? `<button class="btn btn-primary" data-modal="mission">${icons.plus}<span>Nouvelle mission</span></button>` : ''}</div><div class="toolbar"><label class="search">${icons.search}<input id="search" value="${esc(state.query)}" placeholder="Métier, ville, secteur..."></label><div class="filters"><select class="select" id="sector-filter"><option value="all">Tous les secteurs</option>${sectorOpts}</select>${!isCandidate ? `<select class="select" id="status-filter"><option value="all">Tous les statuts</option>${statusOpts}</select>` : ''}</div></div>${isCandidate ? candidateJobGrid(visible) : `<section class="card"><div class="card-head"><h2>${visible.length} mission${visible.length > 1 ? 's' : ''}</h2></div>${visible.length ? `<div class="mission-list">${visible.map(missionCard).join('')}</div>` : empty('Aucune mission ne correspond à votre recherche.')}${loadMoreButton('missions', 'Charger plus de missions')}</section>`}`;
}

function candidateJobGrid(visible) {
  const applied = new Set(state.workspace.applications.map((a) => a.missionId));
  const action = (m) => applied.has(m.id)
    ? badge('Candidature envoyée', 'gray')
    : `<button class="btn btn-primary btn-small" data-apply="${m.id}">Postuler</button>`;
  return `<h2 class="section-title">${visible.length} mission${visible.length > 1 ? 's' : ''}</h2>
    ${visible.length ? `<div class="job-grid">${visible.map((m) => jobCard(m, action(m))).join('')}</div>` : empty('Aucune mission ne correspond à votre recherche.')}
    ${loadMoreButton('missions', 'Charger plus de missions')}`;
}

function applicationCard(application) {
  return `<article class="mission"><div><h3>${esc(application.missionTitle)}</h3><div class="meta"><span>${icons.building} Entreprise confidentielle</span><span>${icons.map} ${esc(application.city)}</span><span>${icons.clock} ${dateText(application.createdAt)}</span></div></div>${badge(label(applicationStatus, application.status))}</article>`;
}

function applicationsPage() {
  const applications = state.workspace.applications;
  if (state.session.role === 'candidate') {
    return `<div class="page-head"><div><h1>Mes candidatures</h1><p>Les changements de statut sont affichés ici.</p></div></div><section class="card">${applications.length ? `<div class="mission-list">${applications.map(applicationCard).join('')}</div>` : empty('Vous n\'avez pas encore postulé.')}</section>`;
  }
  const rows = applications.map((a) => `<tr>
    <td><strong>${esc(a.candidateName)}</strong></td>
    <td>${esc(a.missionTitle)}</td>
    <td>${dateText(a.createdAt)}</td>
    <td class="notes-cell">${a.internalNotes ? `<span class="note-preview" title="${esc(a.internalNotes)}">${esc(a.internalNotes.substring(0, 40))}${a.internalNotes.length > 40 ? '…' : ''}</span>` : '<span style="color:var(--muted)">-</span>'}</td>
    <td><select class="select" data-application-status="${a.id}">${Object.entries(applicationStatus).map(([k, v]) => `<option value="${k}" ${a.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
    <td><div class="row"><button class="btn btn-light btn-small" data-candidate="${a.id}">${icons.file} Profil & CV</button><button class="btn btn-light btn-small" data-interview="${a.id}">Entretien</button><button class="btn btn-primary btn-small" data-propose="${a.id}">Présenter</button></div></td>
  </tr>`).join('');
  return `<div class="page-head"><div><h1>Candidatures</h1><p>Consultez les profils et CV, planifiez les entretiens, puis présentez les meilleurs candidats.</p></div></div><div class="table-wrap"><table><thead><tr><th>Candidat</th><th>Mission</th><th>Date</th><th>Notes internes</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>${loadMoreButton('applications')}`;
}

function candidatesPage() {
  const profiles = state.workspace.profiles;
  const rows = profiles.length ? profiles.map((p) => {
    const pct = profileScore(p);
    return `<tr>
      <td><div class="person"><div class="anon-avatar" style="flex-shrink:0">${initials(p.name || '?')}</div><div><strong>${esc(p.name || '-')}</strong><span>${esc(p.phone || '')}</span></div></div></td>
      <td>${esc(p.city || '-')}</td>
      <td><div class="tags" style="margin:0">${(p.skills || []).slice(0, 3).map(s => `<span class="tag">${esc(s)}</span>`).join('')}${(p.skills || []).length > 3 ? `<span class="tag">+${(p.skills || []).length - 3}</span>` : ''}</div></td>
      <td>${esc(p.availability || '-')}</td>
      <td><div class="progress" style="width:72px;height:5px;margin-bottom:3px"><span style="width:${pct}%"></span></div><small style="color:var(--muted);font-size:10px">${pct}%</small></td>
      <td><button class="btn btn-light btn-small" data-profile-candidate="${p.id}">Voir profil & CV</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted)">Aucun candidat inscrit.</td></tr>`;
  return `<div class="page-head"><div><h1>Candidats</h1><p>Tous les profils candidats inscrits sur la plateforme.</p></div></div><div class="table-wrap"><table><thead><tr><th>Candidat</th><th>Ville</th><th>Compétences</th><th>Disponibilité</th><th>Profil</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>${loadMoreButton('profiles')}`;
}

function companiesPage() {
  const rows = state.workspace.companies.map((c) => {
    const isScraped = c.source === 'scraped';
    const action = isScraped
      ? `<a href="${esc(c.sourceUrl || '#')}" target="_blank" rel="noopener" class="btn btn-light btn-small">Voir le site</a>`
      : `<div class="row"><button class="btn btn-primary btn-small" data-company-status="${c.id}:active">Valider</button><button class="btn btn-light btn-small" data-company-status="${c.id}:rejected">Refuser</button></div>`;
    return `<tr>
    <td><strong>${esc(c.companyName)}</strong>${isScraped ? ` <span class="badge gray" style="font-size:9px">Importée</span>` : ''}</td>
    <td>${isScraped ? `<span style="color:var(--muted)">-</span>` : esc(c.contactName)}</td>
    <td>${esc(c.city || '-')}</td>
    <td>${isScraped ? `<span style="color:var(--muted)">-</span>` : esc(c.siret || 'Non renseigné')}</td>
    <td>${badge(c.status === 'active' ? 'Active' : c.status === 'rejected' ? 'Refusée' : 'En attente')}</td>
    <td>${action}</td>
  </tr>`;
  }).join('');
  return `<div class="page-head"><div><h1>Entreprises</h1><p>Validez les entreprises avant leur mise en relation.</p></div></div><div class="table-wrap"><table><thead><tr><th>Entreprise</th><th>Contact</th><th>Ville</th><th>SIRET</th><th>Statut</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>${loadMoreButton('companies')}`;
}

function proposalsPage() {
  const proposals = state.workspace.proposals;
  const cards = proposals.map((p) => `<article class="candidate">
    <div class="candidate-top"><div><h3>${esc(p.anonymousName)}</h3><p>${esc(p.missionTitle)} · ${esc(p.city)}</p></div>${badge(label(proposalStatus, p.response))}</div>
    <div class="tags">${(p.skills || []).map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>
    <p class="proposal-summary">${esc(p.summary || 'Profil qualifié par notre équipe.')}</p>
    <div class="candidate-foot"><span>Proposé le ${dateText(p.createdAt)}</span>
      <div class="row">
        ${p.cvUrl ? `<a href="${esc(p.cvUrl)}" target="_blank" rel="noopener" class="btn btn-light btn-small">${icons.file} Voir CV</a>` : ''}
        ${p.response === 'pending' ? `<button class="btn btn-primary btn-small" data-proposal-response="${p.id}:accepted">Accepter</button><button class="btn btn-light btn-small" data-proposal-response="${p.id}:rejected">Refuser</button>` : ''}
      </div>
    </div>
  </article>`).join('');
  return `<div class="page-head"><div><h1>Profils proposés</h1><p>Les coordonnées personnelles restent masquées. Votre décision est transmise à l'administrateur.</p></div></div><section class="card">${proposals.length ? `<div class="candidate-list">${cards}</div>` : empty('Aucun profil proposé pour le moment.')}</section>`;
}

function interviewsPage() {
  const rows = state.workspace.interviews.map(i => `<tr>
    <td><strong>${esc(i.candidateName)}</strong></td>
    <td>${esc(i.missionTitle)}</td>
    <td>${esc(i.scheduledAt)}</td>
    <td>${esc(i.notes || 'À compléter')}</td>
    <td>${esc(i.score || '-')} / 5</td>
  </tr>`).join('');
  return `<div class="page-head"><div><h1>Entretiens</h1><p>Historique des entretiens planifiés et comptes-rendus.</p></div></div><div class="table-wrap"><table><thead><tr><th>Candidat</th><th>Mission</th><th>Date</th><th>Compte-rendu</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table></div>${loadMoreButton('interviews')}`;
}

// ── Placements, feuilles de temps, facturation ────────────────────────────────

function placementsPage() {
  const role = state.session.role;
  if (role === 'admin') return adminPlacementsPage();
  if (role === 'company') return companyPlacementsPage();
  return candidatePlacementsPage();
}

function adminPlacementsPage() {
  const w = state.workflowSpace;
  const placedProposalIds = new Set(w.placements.map((p) => p.proposalId));
  const toConfirm = state.workspace.proposals.filter((p) => p.response === 'accepted' && !placedProposalIds.has(p.id));
  const active = w.placements.filter((p) => p.status === 'active');
  const ended = w.placements.filter((p) => p.status === 'ended');

  const toConfirmCard = (p) => {
    const profile = state.workspace.profiles.find((x) => x.id === p.candidateId) || {};
    return `<article class="candidate"><div class="candidate-top"><div><h3>${esc(profile.name || p.anonymousName)}</h3><p>${esc(p.missionTitle)} · ${esc(p.city || '')}</p></div></div><div class="candidate-foot"><span>Accepté par l'entreprise</span><button class="btn btn-primary btn-small" data-confirm-placement="${p.id}">Confirmer le placement</button></div></article>`;
  };
  const placementCard = (p) => `<article class="candidate"><div class="candidate-top"><div><h3>${esc(p.candidateName)}</h3><p>${esc(p.missionTitle)} · ${esc(p.companyName)}</p></div>${badge(label(placementStatus, p.status))}</div><div class="tags"><span class="tag">${esc(p.billRate)} FCFA/h facturé</span>${p.payRate != null ? `<span class="tag">${esc(p.payRate)} FCFA/h payé</span>` : ''}</div><div class="candidate-foot"><span>${p.status === 'ended' ? 'Terminé le ' + esc(shortDate(p.endDate)) : 'Depuis le ' + esc(shortDate(p.startDate) || '-')}</span><div class="row"><button class="btn btn-light btn-small" data-placement-detail="${p.id}">Suivi</button>${p.status === 'active' ? `<button class="btn btn-primary btn-small" data-generate-invoice="${p.id}">Facturer</button>` : ''}</div></div></article>`;

  return `<div class="page-head"><div><h1>Placements</h1><p>De l'acceptation par l'entreprise jusqu'à la fin de mission.</p></div></div>
    <div class="kanban">
      <div class="column"><div class="column-head">À confirmer<span class="count">${toConfirm.length}</span></div>${toConfirm.length ? toConfirm.map(toConfirmCard).join('') : empty('Aucune proposition acceptée en attente.')}</div>
      <div class="column"><div class="column-head">Actifs<span class="count">${active.length}</span></div>${active.length ? active.map(placementCard).join('') : empty('Aucun placement actif.')}</div>
      <div class="column"><div class="column-head">Terminés<span class="count">${ended.length}</span></div>${ended.length ? ended.map(placementCard).join('') : empty('Aucun placement terminé.')}</div>
    </div>`;
}

function companyPlacementsPage() {
  const w = state.workflowSpace;
  const active = w.placements.filter((p) => p.status === 'active');
  const ended = w.placements.filter((p) => p.status === 'ended');
  const pendingTimesheets = w.timesheets.filter((t) => t.status === 'submitted');

  const timesheetRow = (t) => `<tr><td><strong>${esc(t.candidateName)}</strong></td><td>${esc(t.missionTitle)}</td><td>${period(t.periodStart, t.periodEnd)}</td><td>${esc(t.totalHours)} h</td><td><div class="row"><button class="btn btn-primary btn-small" data-timesheet-validate="${t.id}">Valider</button><button class="btn btn-light btn-small" data-timesheet-dispute="${t.id}">Contester</button></div></td></tr>`;
  const placementCard = (p) => `<article class="mission"><div><h3>${esc(p.candidateName)}</h3><div class="meta"><span>${icons.briefcase} ${esc(p.missionTitle)}</span><span>${icons.money} ${esc(p.billRate)} FCFA/h</span><span>${icons.clock} ${p.status === 'ended' ? 'Terminé le ' + esc(shortDate(p.endDate)) : 'Depuis le ' + esc(shortDate(p.startDate) || '-')}</span></div></div>${badge(label(placementStatus, p.status))}</article>`;

  return `<div class="page-head"><div><h1>Placements</h1><p>Validez les heures déclarées par vos intérimaires.</p></div></div>
    <section class="card"><div class="card-head"><h2>Feuilles de temps à valider</h2></div>${pendingTimesheets.length ? `<div class="table-wrap"><table><thead><tr><th>Candidat</th><th>Mission</th><th>Période</th><th>Heures</th><th>Action</th></tr></thead><tbody>${pendingTimesheets.map(timesheetRow).join('')}</tbody></table></div>` : empty('Aucune feuille de temps en attente.')}</section>
    <section class="card"><div class="card-head"><h2>Placements actifs</h2></div>${active.length ? `<div class="mission-list">${active.map(placementCard).join('')}</div>` : empty('Aucun placement actif.')}</section>
    ${ended.length ? `<section class="card"><div class="card-head"><h2>Placements terminés</h2></div><div class="mission-list">${ended.map(placementCard).join('')}</div></section>` : ''}`;
}

function candidatePlacementsPage() {
  const w = state.workflowSpace;
  const active = w.placements.filter((p) => p.status === 'active');
  const ended = w.placements.filter((p) => p.status === 'ended');
  const pending = state.acceptedProposals.filter((p) => !w.placements.some((pl) => pl.proposalId === p.id));

  const timesheetRow = (t) => `<tr><td>${period(t.periodStart, t.periodEnd)}</td><td>${esc(t.totalHours)} h</td><td>${badge(label(timesheetStatus, t.status))}</td><td>${t.companyNote ? `<span class="note-preview" title="${esc(t.companyNote)}">${esc(t.companyNote.substring(0, 30))}${t.companyNote.length > 30 ? '…' : ''}</span>` : '<span style="color:var(--muted)">-</span>'}</td><td>${t.status === 'disputed' ? `<button class="btn btn-light btn-small" data-edit-timesheet="${t.id}">Modifier et renvoyer</button>` : ''}</td></tr>`;
  const placementBlock = (p) => {
    const items = w.timesheets.filter((t) => t.placementId === p.id);
    return `<section class="card">
      <div class="card-head"><div><h2>${esc(p.missionTitle)}</h2><p style="color:var(--muted);font-size:12px;margin:4px 0 0">${esc(p.companyName)}${p.payRate != null ? ' · ' + esc(p.payRate) + ' FCFA/h' : ''}</p></div><div class="row">${badge(label(placementStatus, p.status))}${p.status === 'active' ? `<button class="btn btn-primary btn-small" data-new-timesheet="${p.id}">Nouvelle feuille de temps</button>` : ''}</div></div>
      <div class="table-wrap"><table><thead><tr><th>Période</th><th>Heures</th><th>Statut</th><th>Note entreprise</th><th></th></tr></thead><tbody>${items.length ? items.map(timesheetRow).join('') : '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--muted)">Aucune feuille de temps.</td></tr>'}</tbody></table></div>
    </section>`;
  };
  const pendingCard = (p) => `<article class="candidate"><div class="candidate-top"><div><h3>${esc(p.missionTitle)}</h3><p>Votre profil a été accepté, l'équipe Interim finalise votre placement.</p></div></div></article>`;

  return `<div class="page-head"><div><h1>Mes placements</h1><p>Déclarez vos heures et suivez vos paiements.</p></div></div>
    ${pending.length ? `<section class="card"><div class="card-head"><h2>En attente de confirmation</h2></div><div class="candidate-list">${pending.map(pendingCard).join('')}</div></section>` : ''}
    ${active.length || ended.length ? [...active, ...ended].map(placementBlock).join('') : empty('Aucun placement pour le moment.')}
    <section class="card"><div class="card-head"><h2>Mes paiements</h2></div>${w.payments.length ? `<div class="table-wrap"><table><thead><tr><th>Période</th><th>Heures</th><th>Montant</th><th>Statut</th></tr></thead><tbody>${w.payments.map((pay) => `<tr><td>${period(pay.periodStart, pay.periodEnd)}</td><td>${esc(pay.hours)} h</td><td>${esc(pay.amount)} FCFA</td><td>${badge(label(paymentStatus, pay.status))}</td></tr>`).join('')}</tbody></table></div>` : empty('Aucun paiement pour le moment.')}</section>`;
}

function facturationPage() {
  return state.session.role === 'admin' ? adminFacturationPage() : companyFacturesPage();
}

function adminFacturationPage() {
  const w = state.workflowSpace;
  const tab = state.facturationTab;
  const timesheetRow = (t) => `<tr><td><strong>${esc(t.candidateName)}</strong></td><td>${esc(t.missionTitle)}</td><td>${period(t.periodStart, t.periodEnd)}</td><td>${esc(t.totalHours)} h</td><td>${badge(label(timesheetStatus, t.status))}</td></tr>`;
  const invoiceRow = (inv) => {
    const payment = w.payments.find((p) => p.id === inv.paymentId);
    const commission = payment ? inv.totalAmount - payment.amount : null;
    return `<tr>
      <td><strong>${esc(inv.companyName)}</strong></td>
      <td>${period(inv.periodStart, inv.periodEnd)}</td>
      <td>${esc(inv.totalAmount)} FCFA</td>
      <td>${badge(label(invoiceStatus, inv.status))}</td>
      <td>${payment ? esc(payment.amount) + ' FCFA · ' + label(paymentStatus, payment.status) : '-'}</td>
      <td>${commission != null ? esc(commission) + ' FCFA' : '-'}</td>
      <td><div class="row">
        ${inv.status === 'draft' ? `<button class="btn btn-primary btn-small" data-invoice-status="${inv.id}:sent">Marquer envoyée</button>` : ''}
        ${inv.status === 'sent' ? `<button class="btn btn-primary btn-small" data-invoice-status="${inv.id}:paid">Marquer payée</button>` : ''}
        ${payment && payment.status === 'pending' ? `<button class="btn btn-light btn-small" data-payment-status="${payment.id}:paid">Payer candidat</button>` : ''}
      </div></td>
    </tr>`;
  };
  const statusOpts = ['validated', 'submitted', 'disputed', 'locked', 'all']
    .map((k) => `<option value="${k}" ${state.timesheetStatusFilter === k ? 'selected' : ''}>${k === 'all' ? 'Toutes' : label(timesheetStatus, k)}</option>`).join('');

  return `<div class="page-head"><div><h1>Facturation</h1><p>Factures entreprises, paiements candidats et commission.</p></div></div>
    <div class="toolbar"><div class="filters">
      <select class="select" id="facturation-tab"><option value="invoices" ${tab === 'invoices' ? 'selected' : ''}>Factures &amp; paiements</option><option value="timesheets" ${tab === 'timesheets' ? 'selected' : ''}>Feuilles de temps</option></select>
      ${tab === 'timesheets' ? `<select class="select" id="timesheet-status-filter">${statusOpts}</select>` : ''}
    </div></div>
    ${tab === 'timesheets'
      ? `<div class="table-wrap"><table><thead><tr><th>Candidat</th><th>Mission</th><th>Période</th><th>Heures</th><th>Statut</th></tr></thead><tbody>${w.timesheets.length ? w.timesheets.map(timesheetRow).join('') : '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--muted)">Aucune feuille de temps.</td></tr>'}</tbody></table></div>${w.pagination?.timesheets?.hasMore ? '<div class="load-more"><button class="btn btn-light btn-small" data-load-more-timesheets>Charger plus</button></div>' : ''}`
      : `<div class="table-wrap"><table><thead><tr><th>Entreprise</th><th>Période</th><th>Facturé</th><th>Statut</th><th>Paiement candidat</th><th>Commission</th><th>Action</th></tr></thead><tbody>${w.invoices.length ? w.invoices.map(invoiceRow).join('') : '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--muted)">Aucune facture.</td></tr>'}</tbody></table></div>`}`;
}

function companyFacturesPage() {
  const invoices = state.workflowSpace.invoices;
  const row = (inv) => `<tr><td>${period(inv.periodStart, inv.periodEnd)}</td><td>${esc(inv.totalAmount)} FCFA</td><td>${badge(label(invoiceStatus, inv.status))}</td></tr>`;
  return `<div class="page-head"><div><h1>Mes factures</h1><p>Historique de facturation pour vos missions intérim.</p></div></div>
    <div class="table-wrap"><table><thead><tr><th>Période</th><th>Montant</th><th>Statut</th></tr></thead><tbody>${invoices.length ? invoices.map(row).join('') : '<tr><td colspan="3" style="text-align:center;padding:30px;color:var(--muted)">Aucune facture pour le moment.</td></tr>'}</tbody></table></div>`;
}

// ── Messagerie ─────────────────────────────────────────────────────────────

function threadName(conversation) {
  const s = state.session;
  if (!conversation) return '';
  if (conversation.type === 'admin-candidate' || conversation.type === 'admin-company') return s.role === 'admin' ? (conversation.candidateName || conversation.companyName || 'Équipe Interim') : 'Équipe Interim';
  if (s.role === 'candidate') return conversation.companyName || 'Entreprise';
  if (s.role === 'company') return conversation.candidateName || 'Candidat';
  return `${conversation.candidateName || 'Candidat'} / ${conversation.companyName || 'Entreprise'}`;
}

function messagesPage() {
  const s = state.session;
  const conversation = state.chat.conversations.find((c) => c.id === state.chat.activeId);
  const list = state.chat.conversations
    .slice()
    .sort((a, b) => (b.lastMessageAt?.toMillis?.() || 0) - (a.lastMessageAt?.toMillis?.() || 0))
    .map((c) => `<button class="chat-item ${c.id === state.chat.activeId ? 'active' : ''}" data-select-conversation="${c.id}"><span>${esc(threadName(c))}</span>${c.unread?.[s.role] ? `<span class="chat-unread">${c.unread[s.role]}</span>` : ''}</button>`)
    .join('');
  const messages = state.chat.messages
    .map((m) => `<div class="bubble ${m.senderId === s.uid ? 'mine' : ''}"><p>${esc(m.text)}</p><time>${m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</time></div>`)
    .join('');
  const intro = s.role === 'candidate' ? 'Échangez avec l\'équipe Interim, et avec l\'entreprise une fois votre profil accepté.'
    : s.role === 'company' ? 'Échangez avec l\'équipe Interim et avec les candidats que vous avez acceptés.'
    : 'Toutes les conversations candidats et entreprises.';

  return `<div class="page-head"><div><h1>Messages</h1><p>${intro}</p></div></div>
    <div class="chat-shell">
      <aside class="chat-list">${state.chat.loading ? '<p class="muted-block" style="padding:16px">Chargement...</p>' : (list || empty('Aucune conversation pour le moment.'))}</aside>
      <section class="chat-panel">
        ${conversation
          ? `<div class="chat-panel-head">${esc(threadName(conversation))}</div><div class="chat-thread" id="chat-thread">${messages || '<p class="muted-block" style="padding:20px">Aucun message pour le moment.</p>'}</div><form id="chat-form" class="chat-input"><input name="text" placeholder="Écrire un message..." autocomplete="off" required><button class="btn btn-primary btn-small">Envoyer</button></form>`
          : '<div class="chat-panel-empty">Sélectionnez une conversation.</div>'}
      </section>
    </div>`;
}

function preserveChatInput(renderFn) {
  const input = document.querySelector('#chat-form [name=text]');
  const draft = input ? input.value : '';
  const hadFocus = document.activeElement === input;
  renderFn();
  if (!draft) return;
  const newInput = document.querySelector('#chat-form [name=text]');
  if (newInput) { newInput.value = draft; if (hadFocus) newInput.focus(); }
}

async function enterMessages() {
  const session = state.session;
  const token = (state.chat.token = (state.chat.token || 0) + 1);
  state.chat.loading = true;
  const accepted = state.acceptedProposals || [];
  if (session.role === 'candidate') {
    try { await ensureAdminCandidateConversation(session.uid, session.displayName); } catch (error) { toast(errorMessage(error), true); }
    const companyIds = [...new Set(accepted.map((p) => p.companyId))];
    for (const companyId of companyIds) {
      const p = accepted.find((x) => x.companyId === companyId);
      try {
        // Best-effort self-heal: the grant is normally created by the company at
        // accept-time, but a candidate can also create it themselves (the rule
        // re-verifies a real accepted proposal), which covers proposals accepted
        // before this existed or if that earlier write never completed.
        await createChatGrant(p, companyId);
        await ensureCandidateCompanyConversation(session.uid, companyId, { missionTitle: p.missionTitle });
      } catch { /* this one thread stays unavailable; others must not be blocked */ }
    }
  } else if (session.role === 'company') {
    try { await ensureAdminCompanyConversation(session.uid, session.displayName); } catch (error) { toast(errorMessage(error), true); }
    const candidateIds = [...new Set(accepted.map((p) => p.candidateId))];
    for (const candidateId of candidateIds) {
      const p = accepted.find((x) => x.candidateId === candidateId);
      try {
        await createChatGrant(p, session.uid);
        await ensureCandidateCompanyConversation(candidateId, session.uid, { candidateName: p.anonymousName, missionTitle: p.missionTitle });
      } catch { /* this one thread stays unavailable; others must not be blocked */ }
    }
  }
  if (state.chat.token !== token) return;
  state.chat.loading = false;
  state.chat.unsubConversations = subscribeConversations(session, (conversations) => {
    state.chat.conversations = conversations;
    if (!state.chat.activeId && conversations.length) selectConversation(conversations[0].id);
    else preserveChatInput(render);
  });
  render();
}

function leaveMessages() {
  state.chat.unsubConversations?.();
  state.chat.unsubMessages?.();
  state.chat = { conversations: [], activeId: null, messages: [], unsubConversations: null, unsubMessages: null, loading: false, token: (state.chat.token || 0) + 1 };
}

function selectConversation(id) {
  state.chat.unsubMessages?.();
  state.chat.activeId = id;
  const conversation = state.chat.conversations.find((c) => c.id === id);
  if (conversation) markConversationRead(conversation, state.session).catch(() => {});
  state.chat.unsubMessages = subscribeMessages(id, (messages) => { state.chat.messages = messages; preserveChatInput(render); });
  render();
}

// ── Modales : placement, feuilles de temps, suivi ─────────────────────────────

function confirmPlacementModal(proposal) {
  const profile = state.workspace.profiles.find((p) => p.id === proposal.candidateId) || {};
  const company = state.workspace.companies.find((c) => c.id === proposal.companyId) || {};
  modal(`<div class="modal-head"><div><h2>Confirmer le placement</h2><p>${esc(profile.name || proposal.anonymousName)} · ${esc(proposal.missionTitle)}</p></div><button class="close" data-close aria-label="Fermer">${icons.x}</button></div>
    <form id="placement-form" class="form-grid">
      <div class="field"><label>Taux payé au candidat (FCFA/h)</label><input type="number" name="payRate" min="0" step="1" required></div>
      <div class="field"><label>Taux facturé à l'entreprise (FCFA/h)</label><input type="number" name="billRate" min="0" step="1" required></div>
      <div class="field full"><label>Date de début</label><input type="date" name="startDate" required></div>
      <div class="modal-actions full"><button type="button" class="btn btn-light" data-close>Annuler</button><button class="btn btn-primary">Confirmer</button></div>
    </form>`);
  document.querySelector('#placement-form').onsubmit = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await createPlacement(state.session, {
        applicationId: proposal.applicationId || null, proposalId: proposal.id, missionId: proposal.missionId, missionTitle: proposal.missionTitle,
        candidateId: proposal.candidateId, candidateName: profile.name || proposal.anonymousName,
        companyId: proposal.companyId, companyName: company.companyName || proposal.companyId,
        billRate: values.billRate, payRate: values.payRate, startDate: values.startDate
      });
      if (proposal.applicationId) await updateApplication(proposal.applicationId, { status: 'accepted' });
      document.querySelector('.modal-backdrop')?.remove();
      await refresh('Placement confirmé.');
    } catch (error) { toast(errorMessage(error), true); }
  };
}

function endPlacementModal(placement) {
  modal(`<div class="modal-head"><div><h2>Clôturer le placement</h2><p>${esc(placement.candidateName)} · ${esc(placement.missionTitle)}</p></div><button class="close" data-close aria-label="Fermer">${icons.x}</button></div>
    <form id="end-placement-form" class="form-grid">
      <div class="field full"><label>Motif de fin</label><select name="endReason"><option value="completed">Mission terminée normalement</option><option value="candidate">Rompu par le candidat</option><option value="company">Rompu par l'entreprise</option><option value="other">Autre</option></select></div>
      <div class="modal-actions full"><button type="button" class="btn btn-light" data-close>Annuler</button><button class="btn btn-primary">Clôturer</button></div>
    </form>`);
  document.querySelector('#end-placement-form').onsubmit = async (event) => {
    event.preventDefault();
    const { endReason } = Object.fromEntries(new FormData(event.currentTarget));
    try { await endPlacement(placement.id, endReason); document.querySelector('.modal-backdrop')?.remove(); await refresh('Placement clôturé.'); }
    catch (error) { toast(errorMessage(error), true); }
  };
}

function followUpModal(placement) {
  modal(`<div class="modal-head"><div><h2>Ajouter un suivi</h2><p>${esc(placement.candidateName)} · ${esc(placement.missionTitle)}</p></div><button class="close" data-close aria-label="Fermer">${icons.x}</button></div>
    <form id="followup-form" class="form-grid">
      <div class="field full"><label>Note</label><textarea name="note" required></textarea></div>
      <div class="field"><label>Satisfaction (1 à 5)</label><input type="number" name="satisfaction" min="1" max="5"></div>
      <div class="modal-actions full"><button type="button" class="btn btn-light" data-close>Annuler</button><button class="btn btn-primary">Enregistrer</button></div>
    </form>`);
  document.querySelector('#followup-form').onsubmit = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await createFollowUp(state.session, placement, values); document.querySelector('.modal-backdrop')?.remove(); await refresh('Suivi enregistré.'); }
    catch (error) { toast(errorMessage(error), true); }
  };
}

async function placementDetailModal(placement) {
  const isAdmin = state.session.role === 'admin';
  modal(`<div class="modal-head"><div><h2>${esc(placement.candidateName)}</h2><p>${esc(placement.missionTitle)} · ${esc(placement.companyName)}</p></div><button class="close" data-close aria-label="Fermer">${icons.x}</button></div>
    <div class="profile-detail">
      <div class="detail-row"><label>Statut</label><span>${esc(label(placementStatus, placement.status))}</span></div>
      <div class="detail-row"><label>Taux facturé</label><span>${esc(placement.billRate)} FCFA/h</span></div>
      <div class="detail-row"><label>Début</label><span>${esc(shortDate(placement.startDate) || '-')}</span></div>
      <div class="detail-row"><label>Fin</label><span>${placement.endDate ? esc(shortDate(placement.endDate)) + ' · ' + esc(label(endReasonLabel, placement.endReason)) : '-'}</span></div>
    </div>
    <div class="section-label">Suivi post-placement</div>
    <div id="followups-zone"><p class="muted-block">Chargement...</p></div>
    ${isAdmin ? `<div class="modal-actions" style="justify-content:flex-start;margin-top:14px"><button type="button" class="btn btn-light btn-small" id="add-followup">Ajouter un suivi</button>${placement.status === 'active' ? '<button type="button" class="btn btn-light btn-small" id="end-placement">Clôturer le placement</button>' : ''}</div>` : ''}
    <div class="modal-actions"><button type="button" class="btn btn-light" data-close>Fermer</button></div>`);

  document.querySelector('#add-followup')?.addEventListener('click', () => { document.querySelector('.modal-backdrop')?.remove(); followUpModal(placement); });
  document.querySelector('#end-placement')?.addEventListener('click', () => { document.querySelector('.modal-backdrop')?.remove(); endPlacementModal(placement); });

  try {
    const followUps = await loadFollowUps(placement.id);
    const zone = document.querySelector('#followups-zone');
    if (zone) zone.innerHTML = followUps.length
      ? `<div class="doc-list">${followUps.map((f) => `<div class="doc-link doc-link-muted" style="align-items:flex-start"><span><strong>${dateText(f.createdAt)}</strong>${f.satisfaction ? ' · ' + f.satisfaction + '/5' : ''}<br>${esc(f.note)}</span></div>`).join('')}</div>`
      : '<p class="muted-block">Aucun suivi enregistré.</p>';
  } catch { const zone = document.querySelector('#followups-zone'); if (zone) zone.innerHTML = '<p class="muted-block">Impossible de charger le suivi.</p>'; }
}

function disputeTimesheetModal(timesheet) {
  modal(`<div class="modal-head"><div><h2>Contester la feuille de temps</h2><p>${esc(timesheet.candidateName)} · ${period(timesheet.periodStart, timesheet.periodEnd)}</p></div><button class="close" data-close aria-label="Fermer">${icons.x}</button></div>
    <form id="dispute-form" class="form-grid">
      <div class="field full"><label>Motif</label><textarea name="companyNote" required></textarea></div>
      <div class="modal-actions full"><button type="button" class="btn btn-light" data-close>Annuler</button><button class="btn btn-primary">Contester</button></div>
    </form>`);
  document.querySelector('#dispute-form').onsubmit = async (event) => {
    event.preventDefault();
    const { companyNote } = Object.fromEntries(new FormData(event.currentTarget));
    try { await respondToTimesheet(timesheet.id, 'disputed', companyNote); document.querySelector('.modal-backdrop')?.remove(); await refresh('Feuille de temps contestée.'); }
    catch (error) { toast(errorMessage(error), true); }
  };
}

function timesheetModal(placement, existing = null) {
  const iso = (d) => d.toISOString().slice(0, 10);
  const today = new Date();
  const defaultStart = existing?.periodStart || iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7)));
  modal(`<div class="modal-head"><div><h2>${existing ? 'Modifier la feuille de temps' : 'Nouvelle feuille de temps'}</h2><p>${esc(placement.missionTitle)}</p></div><button class="close" data-close aria-label="Fermer">${icons.x}</button></div>
    <form id="timesheet-form" class="form-grid">
      <div class="field full"><label>Semaine du (lundi)</label><input type="date" name="periodStart" value="${defaultStart}" required></div>
      <div class="timesheet-days" id="timesheet-days"></div>
      <div class="modal-actions full"><button type="button" class="btn btn-light" data-close>Annuler</button><button class="btn btn-primary">Enregistrer</button></div>
    </form>`);

  const daysZone = document.querySelector('#timesheet-days');
  const startInput = document.querySelector('[name=periodStart]');
  function renderDays() {
    if (!startInput.value) return;
    const start = new Date(`${startInput.value}T00:00:00`);
    daysZone.innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const key = iso(d);
      const existingHours = existing?.days?.find((x) => x.date === key)?.hours ?? '';
      return `<div class="field"><label>${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</label><input type="number" min="0" max="24" step="0.5" name="hours_${key}" value="${existingHours}"></div>`;
    }).join('');
  }
  renderDays();
  startInput.addEventListener('input', renderDays);

  document.querySelector('#timesheet-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const periodStart = form.get('periodStart');
    const start = new Date(`${periodStart}T00:00:00`);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const key = iso(d);
      return { date: key, hours: Number(form.get(`hours_${key}`)) || 0 };
    });
    const totalHours = days.reduce((sum, d) => sum + d.hours, 0);
    const periodEnd = days[6].date;
    try {
      if (existing) await resubmitTimesheet(existing.id, { periodStart, periodEnd, days, totalHours });
      else await submitTimesheet({
        placementId: placement.id, candidateId: state.session.uid, candidateName: state.session.displayName,
        companyId: placement.companyId, missionTitle: placement.missionTitle, periodStart, periodEnd, days, totalHours
      });
      document.querySelector('.modal-backdrop')?.remove();
      await refresh('Feuille de temps enregistrée.');
    } catch (error) { toast(errorMessage(error), true); }
  };
}

function profilePage() {
  const isCandidate = state.session.role === 'candidate';
  const p = isCandidate ? state.workspace.profile || {} : state.workspace.company || {};
  const docProviderLabel = { 'google-drive': 'Google Drive', 'firebase-storage': 'Firebase Storage', cloudinary: 'Cloudinary', 'google-drive-pending': 'En attente' };
  const docBadge = p.documentProvider && p.documentProvider !== 'google-drive-pending'
    ? badge(docProviderLabel[p.documentProvider] || p.documentProvider, 'green')
    : badge('Aucun document', 'gray');
  const candidateFields = `
    <div class="field"><label>Nom complet</label><input name="name" value="${esc(p.name)}" required></div>
    <div class="field"><label>Téléphone</label><input name="phone" value="${esc(p.phone)}" required></div>
    <div class="field"><label>Ville</label><input name="city" value="${esc(p.city)}" required></div>
    <div class="field"><label>Disponibilités</label><input name="availability" value="${esc(p.availability)}" placeholder="Immédiate, horaires..."></div>
    <div class="field full"><label>Compétences, séparées par des virgules</label><input name="skills" value="${esc((p.skills || []).join(', '))}"></div>
    <div class="field full"><label>Expérience professionnelle</label><textarea name="experience">${esc(p.experience)}</textarea></div>`;
  const companyFields = `
    <div class="field"><label>Entreprise</label><input name="companyName" value="${esc(p.companyName)}" required></div>
    <div class="field"><label>Contact principal</label><input name="contactName" value="${esc(p.contactName)}" required></div>
    <div class="field"><label>Téléphone</label><input name="phone" value="${esc(p.phone)}" required></div>
    <div class="field"><label>Ville</label><input name="city" value="${esc(p.city)}"></div>
    <div class="field full"><label>SIRET</label><input name="siret" value="${esc(p.siret)}"></div>`;
  return `<div class="page-head"><div><h1>${isCandidate ? 'Mon profil candidat' : 'Mon entreprise'}</h1><p>Ces informations sont accessibles uniquement à l'équipe administrateur.</p></div></div>
    <section class="card"><form id="profile-form" class="form-grid">${isCandidate ? candidateFields : companyFields}<div class="field full"><button class="btn btn-primary">Enregistrer les modifications</button></div></form></section>
    ${isCandidate ? `<section class="card"><div class="card-head"><h2>CV et documents</h2>${docBadge}</div><form id="document-form" class="form-grid"><div class="field"><label>Type de document</label><select name="documentType"><option value="cv">CV</option><option value="identity">Pièce d'identité</option><option value="certificate">Certificat / diplôme</option><option value="other">Autre</option></select></div><div class="field"><label>Fichier (PDF, JPG ou PNG, 10 Mo max.)</label><input name="document" type="file" accept=".pdf,image/jpeg,image/png" required></div><div class="field full"><button class="btn btn-primary">Envoyer le document</button></div></form></section>` : ''}`;
}

function empty(text) {
  return `<div class="empty"><div class="empty-icon">${icons.file}</div>${esc(text)}</div>`;
}

function docsHtml(docs) {
  if (!docs.length) return `<p class="muted-block">Aucun document déposé.</p>`;
  return `<div class="doc-list">${docs.map(d => {
    const url = d.cloudinaryUrl || d.storageUrl || '';
    const type = DOC_TYPES[d.documentType] || d.documentType || 'Document';
    return url
      ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="doc-link">${icons.file}<span><strong>${esc(type)}</strong><small>${esc(d.name || 'fichier')}</small></span></a>`
      : `<div class="doc-link doc-link-muted">${icons.file}<span><strong>${esc(type)}</strong> (stocké sur Google Drive)</span></div>`;
  }).join('')}</div>`;
}

async function candidateModal(application) {
  const profile = state.workspace.profiles.find(p => p.id === application.candidateId) || {};
  modal(`<div class="modal-head"><div><h2>${esc(application.candidateName)}</h2><p>${esc(application.missionTitle)}</p></div><button class="close" data-close aria-label="Fermer">${icons.x}</button></div>
    <div class="profile-detail">
      <div class="detail-row"><label>Ville</label><span>${esc(profile.city || '-')}</span></div>
      <div class="detail-row"><label>Disponibilité</label><span>${esc(profile.availability || '-')}</span></div>
      <div class="detail-row"><label>Téléphone</label><span>${esc(profile.phone || '-')}</span></div>
      <div class="detail-row"><label>Statut dossier</label><span>${esc(label(applicationStatus, application.status))}</span></div>
      ${(profile.skills || []).length ? `<div class="detail-row full"><label>Compétences</label><div class="tags">${profile.skills.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div></div>` : ''}
      ${profile.experience ? `<div class="detail-row full"><label>Expérience</label><p class="muted-block" style="margin:0">${esc(profile.experience)}</p></div>` : ''}
    </div>
    <div class="section-label">Documents</div>
    <div id="docs-zone"><p class="muted-block">Chargement...</p></div>
    <div class="section-label">Note interne</div>
    <form id="notes-form" class="form-grid">
      <div class="field full"><textarea name="internalNotes" rows="3" placeholder="Observations, points forts, réserves...">${esc(application.internalNotes || '')}</textarea></div>
      <div class="modal-actions full"><button type="button" class="btn btn-light" data-close>Fermer</button><button class="btn btn-primary">Enregistrer la note</button></div>
    </form>`);

  document.querySelector('#notes-form').onsubmit = async (event) => {
    event.preventDefault();
    const { internalNotes } = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await updateApplication(application.id, { internalNotes });
      document.querySelector('.modal-backdrop')?.remove();
      await refresh('Note enregistrée.');
    } catch (error) { toast(errorMessage(error), true); }
  };

  try {
    const docs = await getDocumentsForCandidate(application.candidateId);
    const zone = document.querySelector('#docs-zone');
    if (zone) zone.innerHTML = docsHtml(docs);
  } catch {
    const zone = document.querySelector('#docs-zone');
    if (zone) zone.innerHTML = '<p class="muted-block">Impossible de charger les documents.</p>';
  }
}

async function candidateProfileModal(profile) {
  modal(`<div class="modal-head"><div><h2>${esc(profile.name || 'Candidat')}</h2><p>${esc(profile.city || '')}</p></div><button class="close" data-close aria-label="Fermer">${icons.x}</button></div>
    <div class="profile-detail">
      <div class="detail-row"><label>Téléphone</label><span>${esc(profile.phone || '-')}</span></div>
      <div class="detail-row"><label>Disponibilité</label><span>${esc(profile.availability || '-')}</span></div>
      ${(profile.skills || []).length ? `<div class="detail-row full"><label>Compétences</label><div class="tags">${profile.skills.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div></div>` : ''}
      ${profile.experience ? `<div class="detail-row full"><label>Expérience</label><p class="muted-block" style="margin:0">${esc(profile.experience)}</p></div>` : ''}
    </div>
    <div class="section-label">Documents</div>
    <div id="docs-zone"><p class="muted-block">Chargement...</p></div>
    <div class="modal-actions"><button type="button" class="btn btn-light" data-close>Fermer</button></div>`);

  try {
    const docs = await getDocumentsForCandidate(profile.id);
    const zone = document.querySelector('#docs-zone');
    if (zone) zone.innerHTML = docsHtml(docs);
  } catch {
    const zone = document.querySelector('#docs-zone');
    if (zone) zone.innerHTML = '<p class="muted-block">Impossible de charger les documents.</p>';
  }
}

function render() {
  const app = document.querySelector('#app');
  let html;
  if (state.loading) html = loadingScreen();
  else if (state.infoPage === 'contact') html = contactScreen();
  else if (state.infoPage) html = legalPageView();
  else if (state.onboardingUser) html = onboardingScreen();
  else if (!state.session) html = state.guestPage === 'auth' ? authScreen() : publicMissionsScreen();
  else {
    const pages = {
      dashboard, missions: missionsPage, applications: applicationsPage,
      candidates: candidatesPage, companies: companiesPage, proposals: proposalsPage,
      interviews: interviewsPage, profile: profilePage,
      placements: placementsPage, facturation: facturationPage, messages: messagesPage
    };
    html = shell((pages[state.page] || dashboard)());
  }
  app.innerHTML = html;
  if (state.loading) return;
  bindPublic();
  if (state.session && !state.infoPage) bind();
  const chatThread = document.querySelector('#chat-thread');
  if (chatThread) chatThread.scrollTop = chatThread.scrollHeight;
}

async function loadAccepted(session) {
  return session.role === 'admin' ? [] : loadAcceptedProposals(session);
}

async function refresh(message) {
  const [workspace, workflowSpace, acceptedProposals] = await Promise.all([
    loadWorkspace(state.session), loadWorkflowWorkspace(state.session), loadAccepted(state.session)
  ]);
  state.workspace = workspace;
  state.workflowSpace = workflowSpace;
  state.acceptedProposals = acceptedProposals;
  render();
  if (message) toast(message);
}

const closeModal = () => document.querySelector('.modal-backdrop')?.remove();

function modal(content) {
  closeModal();
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">${content}</div></div>`);
  const backdrop = document.querySelector('.modal-backdrop');
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  document.querySelectorAll('[data-close]').forEach(el => el.onclick = closeModal);
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function missionModal() {
  const sectorOpts = SECTORS.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  const isCompany = state.session.role === 'company';
  modal(`<div class="modal-head"><div><h2>Créer une mission</h2><p>${isCompany ? 'Elle sera publiée après validation administrative.' : 'La mission sera publiée immédiatement.'}</p></div><button class="close" data-close aria-label="Fermer">${icons.x}</button></div>
    <form id="mission-form" class="form-grid">
      <div class="field full"><label>Intitulé du poste</label><input name="title" required></div>
      <div class="field"><label>Secteur d'activité</label><select name="sector"><option value="">Non renseigné</option>${sectorOpts}</select></div>
      <div class="field"><label>Ville</label><input name="city" required></div>
      <div class="field"><label>Type de contrat</label><select name="contractType"><option>Intérim</option><option>CDD</option><option>CDI intérimaire</option></select></div>
      <div class="field"><label>Durée</label><input name="duration" required placeholder="3 mois"></div>
      <div class="field"><label>Rémunération</label><input name="pay" required placeholder="500 FCFA/h"></div>
      <div class="field full"><label>Description du poste</label><textarea name="description" required></textarea></div>
      <div class="modal-actions full"><button type="button" class="btn btn-light" data-close>Annuler</button><button class="btn btn-primary">Enregistrer</button></div>
    </form>`);
  document.querySelector('#mission-form').onsubmit = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await createMission(state.session, values); document.querySelector('.modal-backdrop').remove(); await refresh('Mission enregistrée.'); }
    catch (error) { toast(errorMessage(error), true); }
  };
}

function interviewModal(application) {
  modal(`<div class="modal-head"><div><h2>Planifier un entretien</h2><p>${esc(application.candidateName)} · ${esc(application.missionTitle)}</p></div><button class="close" data-close aria-label="Fermer">${icons.x}</button></div>
    <form id="interview-form" class="form-grid">
      <div class="field full"><label>Date et heure</label><input type="datetime-local" name="scheduledAt" required></div>
      <div class="field"><label>Note / 5</label><input type="number" name="score" min="1" max="5"></div>
      <div class="field full"><label>Compte-rendu</label><textarea name="notes"></textarea></div>
      <div class="modal-actions full"><button type="button" class="btn btn-light" data-close>Annuler</button><button class="btn btn-primary">Planifier</button></div>
    </form>`);
  document.querySelector('#interview-form').onsubmit = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await createInterview({ ...values, applicationId: application.id, candidateId: application.candidateId, candidateName: application.candidateName, missionId: application.missionId, missionTitle: application.missionTitle });
      await updateApplication(application.id, { status: 'interview' });
      document.querySelector('.modal-backdrop').remove();
      await refresh('Entretien planifié.');
    } catch (error) { toast(errorMessage(error), true); }
  };
}

async function propose(application) {
  const mission = state.workspace.missions.find(m => m.id === application.missionId);
  const profile = state.workspace.profiles.find(p => p.id === application.candidateId) || {};
  if (!mission) return toast('Mission associée introuvable.', true);
  const parts = (application.candidateName || 'Candidat').split(' ');

  let cvUrl = '';
  try {
    const docs = await getDocumentsForCandidate(application.candidateId);
    const cv = docs.find(d => d.documentType === 'cv') || docs[0];
    if (cv) cvUrl = cv.cloudinaryUrl || cv.storageUrl || '';
  } catch {}

  try {
    await createProposal({
      applicationId: application.id, candidateId: application.candidateId,
      companyId: mission.companyId, missionId: mission.id, missionTitle: mission.title,
      anonymousName: `${parts[0]} ${parts[1]?.[0] || ''}.`,
      city: profile.city || application.city, skills: profile.skills || [],
      summary: profile.experience || "Profil qualifié par l'équipe Interim.",
      cvUrl
    });
    await updateApplication(application.id, { status: 'presented' });
    await refresh('Profil anonymisé présenté à l\'entreprise.');
  } catch (error) { toast(errorMessage(error), true); }
}

function bind() {
  document.querySelectorAll('#logout, #logout-mobile').forEach(el => el.addEventListener('click', () => { leaveMessages(); logout(); }));
  document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => {
    const leavingMessages = state.page === 'messages' && el.dataset.page !== 'messages';
    const enteringMessages = state.page !== 'messages' && el.dataset.page === 'messages';
    if (leavingMessages) leaveMessages();
    state.page = el.dataset.page; state.query = ''; state.filter = 'all'; state.sectorFilter = 'all'; render();
    if (enteringMessages) enterMessages();
  }));
  document.querySelectorAll('[data-modal="mission"]').forEach(el => el.addEventListener('click', missionModal));
  document.querySelector('#search')?.addEventListener('input', (e) => { state.query = e.target.value; render(); document.querySelector('#search')?.focus(); });
  document.querySelector('#status-filter')?.addEventListener('change', (e) => { state.filter = e.target.value; render(); });
  document.querySelector('#sector-filter')?.addEventListener('change', (e) => { state.sectorFilter = e.target.value; render(); });
  document.querySelector('[data-load-more]')?.addEventListener('click', async (e) => {
    const kind = e.currentTarget.dataset.loadMore;
    const cursor = state.workspace.pagination?.[kind]?.cursor;
    e.currentTarget.disabled = true;
    try {
      const page = await loadMorePage(state.session, kind, cursor);
      state.workspace[kind] = state.workspace[kind].concat(page.rows);
      state.workspace.pagination[kind] = { cursor: page.cursor, hasMore: page.hasMore };
      render();
    } catch (error) { toast(errorMessage(error), true); e.currentTarget.disabled = false; }
  });
  document.querySelectorAll('[data-apply]').forEach(el => el.addEventListener('click', async () => {
    const mission = state.workspace.missions.find(m => m.id === el.dataset.apply);
    try { await applyToMission(state.session, mission); await refresh('Candidature envoyée à l\'administrateur.'); } catch (error) { toast(errorMessage(error), true); }
  }));
  document.querySelectorAll('[data-mission-status]').forEach(el => el.addEventListener('click', async () => {
    const [id, status] = el.dataset.missionStatus.split(':');
    const mission = state.workspace.missions.find(m => m.id === id);
    try {
      await updateMissionStatus(id, status);
      await refresh('Statut de la mission mis à jour.');
    } catch (error) { toast(errorMessage(error), true); }
  }));
  document.querySelectorAll('[data-application-status]').forEach(el => el.addEventListener('change', async () => {
    const application = state.workspace.applications.find(a => a.id === el.dataset.applicationStatus);
    try {
      await updateApplication(el.dataset.applicationStatus, { status: el.value });
      await refresh('Candidature mise à jour.');
    } catch (error) { toast(errorMessage(error), true); }
  }));
  document.querySelectorAll('[data-company-status]').forEach(el => el.addEventListener('click', async () => {
    const [id, status] = el.dataset.companyStatus.split(':');
    try {
      await updateCompanyStatus(id, status);
      await refresh('Compte entreprise mis à jour.');
    } catch (error) { toast(errorMessage(error), true); }
  }));
  document.querySelectorAll('[data-interview]').forEach(el => el.addEventListener('click', () => interviewModal(state.workspace.applications.find(a => a.id === el.dataset.interview))));
  document.querySelectorAll('[data-propose]').forEach(el => el.addEventListener('click', () => propose(state.workspace.applications.find(a => a.id === el.dataset.propose))));
  document.querySelectorAll('[data-candidate]').forEach(el => el.addEventListener('click', () => candidateModal(state.workspace.applications.find(a => a.id === el.dataset.candidate))));
  document.querySelectorAll('[data-profile-candidate]').forEach(el => el.addEventListener('click', () => candidateProfileModal(state.workspace.profiles.find(p => p.id === el.dataset.profileCandidate))));
  document.querySelectorAll('[data-proposal-response]').forEach(el => el.addEventListener('click', async () => {
    const [id, response] = el.dataset.proposalResponse.split(':');
    const proposal = state.workspace.proposals.find(p => p.id === id);
    try {
      await respondToProposal(id, response);
      if (response === 'accepted' && proposal) await createChatGrant(proposal, state.session.uid);
      await refresh('Votre réponse a été transmise à l\'administrateur.');
    } catch (error) { toast(errorMessage(error), true); }
  }));
  document.querySelector('#profile-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (state.session.role === 'candidate') { values.skills = values.skills.split(',').map(v => v.trim()).filter(Boolean); await saveCandidateProfile(state.session.uid, values); }
      else await saveCompanyProfile(state.session.uid, values);
      await refresh('Profil enregistré.');
    } catch (error) { toast(errorMessage(error), true); }
  });
  document.querySelector('#document-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('document');
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      try { await uploadCloudinaryDocument(file, form.get('documentType')); await refresh('Document envoyé.'); }
      catch (cloudError) { console.warn('Cloudinary failed, fallback to Storage', cloudError); await uploadStorageDocument(file, form.get('documentType')); await refresh('Document enregistré.'); }
    } catch (error) { toast(errorMessage(error), true); button.disabled = false; }
  });

  document.querySelectorAll('[data-confirm-placement]').forEach(el => el.addEventListener('click', () => {
    const proposal = state.workspace.proposals.find(p => p.id === el.dataset.confirmPlacement);
    if (proposal) confirmPlacementModal(proposal);
  }));
  document.querySelectorAll('[data-placement-detail]').forEach(el => el.addEventListener('click', () => {
    const placement = state.workflowSpace.placements.find(p => p.id === el.dataset.placementDetail);
    if (placement) placementDetailModal(placement);
  }));
  document.querySelectorAll('[data-generate-invoice]').forEach(el => el.addEventListener('click', async () => {
    const placement = state.workflowSpace.placements.find(p => p.id === el.dataset.generateInvoice);
    try { await generateInvoiceAndPayment(state.session, placement); await refresh('Facture et paiement générés.'); }
    catch (error) { toast(errorMessage(error), true); }
  }));
  document.querySelectorAll('[data-timesheet-validate]').forEach(el => el.addEventListener('click', async () => {
    try { await respondToTimesheet(el.dataset.timesheetValidate, 'validated'); await refresh('Feuille de temps validée.'); }
    catch (error) { toast(errorMessage(error), true); }
  }));
  document.querySelectorAll('[data-timesheet-dispute]').forEach(el => el.addEventListener('click', () => {
    const timesheet = state.workflowSpace.timesheets.find(t => t.id === el.dataset.timesheetDispute);
    if (timesheet) disputeTimesheetModal(timesheet);
  }));
  document.querySelectorAll('[data-invoice-status]').forEach(el => el.addEventListener('click', async () => {
    const [id, status] = el.dataset.invoiceStatus.split(':');
    try { await updateInvoiceStatus(id, status); await refresh('Facture mise à jour.'); }
    catch (error) { toast(errorMessage(error), true); }
  }));
  document.querySelectorAll('[data-payment-status]').forEach(el => el.addEventListener('click', async () => {
    const [id, status] = el.dataset.paymentStatus.split(':');
    try { await updatePaymentStatus(id, status); await refresh('Paiement mis à jour.'); }
    catch (error) { toast(errorMessage(error), true); }
  }));
  document.querySelector('#facturation-tab')?.addEventListener('change', (e) => { state.facturationTab = e.target.value; render(); });
  document.querySelector('[data-load-more-timesheets]')?.addEventListener('click', async (e) => {
    const cursor = state.workflowSpace.pagination?.timesheets?.cursor;
    e.currentTarget.disabled = true;
    try {
      const page = await loadMoreTimesheets(state.timesheetStatusFilter, cursor);
      state.workflowSpace.timesheets = state.workflowSpace.timesheets.concat(page.timesheets);
      state.workflowSpace.pagination.timesheets = page.pagination;
      render();
    } catch (error) { toast(errorMessage(error), true); e.currentTarget.disabled = false; }
  });
  document.querySelector('#timesheet-status-filter')?.addEventListener('change', async (e) => {
    state.timesheetStatusFilter = e.target.value;
    try {
      const res = await loadTimesheetsWorkspace(state.session, e.target.value);
      state.workflowSpace.timesheets = res.timesheets;
      state.workflowSpace.pagination.timesheets = res.pagination;
      render();
    } catch (error) { toast(errorMessage(error), true); }
  });
  document.querySelectorAll('[data-new-timesheet]').forEach(el => el.addEventListener('click', () => {
    const placement = state.workflowSpace.placements.find(p => p.id === el.dataset.newTimesheet);
    if (placement) timesheetModal(placement);
  }));
  document.querySelectorAll('[data-edit-timesheet]').forEach(el => el.addEventListener('click', () => {
    const timesheet = state.workflowSpace.timesheets.find(t => t.id === el.dataset.editTimesheet);
    const placement = state.workflowSpace.placements.find(p => p.id === timesheet?.placementId);
    if (placement) timesheetModal(placement, timesheet);
  }));
  document.querySelectorAll('[data-select-conversation]').forEach(el => el.addEventListener('click', () => selectConversation(el.dataset.selectConversation)));
  document.querySelector('#chat-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const conversation = state.chat.conversations.find(c => c.id === state.chat.activeId);
    const input = event.currentTarget.querySelector('[name=text]');
    const text = input.value;
    input.value = '';
    try { await sendMessage(conversation, state.session, text); } catch (error) { toast(errorMessage(error), true); }
  });
}

async function applyPendingMission() {
  const missionId = state.pendingApplyMissionId;
  state.pendingApplyMissionId = null;
  if (!missionId || state.session.role !== 'candidate') return;
  if (state.workspace.applications.some((a) => a.missionId === missionId)) return;
  const mission = state.workspace.missions.find((m) => m.id === missionId);
  if (!mission) return toast('Cette mission n\'est plus disponible ; retrouvez-la depuis "Trouver une mission".', true);
  try {
    await applyToMission(state.session, mission);
    state.workspace = await loadWorkspace(state.session);
    toast('Compte créé et candidature envoyée à l\'administrateur.');
  } catch (error) { toast(errorMessage(error), true); }
}

async function loadSession(user) {
  state.loading = true; render();
  if (!user) {
    leaveMessages();
    Object.assign(state, { session: null, onboardingUser: null, loading: false });
    try {
      const [pub, total] = await Promise.all([loadPublicMissions(), countPublishedMissions().catch(() => null)]);
      state.publicMissions = pub.missions;
      state.publicPagination = pub.pagination;
      state.publicTotal = total;
    } catch (error) { toast(errorMessage(error), true); }
    render();
    return;
  }
  try {
    const session = await getSessionProfile(user);
    if (!session) {
      // Signed in (typically with Google) but no Interim profile yet.
      state.session = null;
      state.onboardingUser = { uid: user.uid, email: user.email, displayName: user.displayName || '' };
      state.infoPage = null;
    } else {
      state.onboardingUser = null;
      state.session = session;
      const [workspace, workflowSpace, acceptedProposals] = await Promise.all([
        loadWorkspace(session), loadWorkflowWorkspace(session), loadAccepted(session)
      ]);
      state.workspace = workspace;
      state.workflowSpace = workflowSpace;
      state.acceptedProposals = acceptedProposals;
      state.page = state.pendingApplyMissionId ? 'applications' : 'dashboard';
      state.infoPage = null;
      await applyPendingMission();
    }
  } catch (error) { toast(errorMessage(error), true); await logout(); }
  state.loading = false;
  render();
}

onAuthStateChanged(auth, (user) => {
  // During email sign-up the profile is written right after the account; register() reloads the session itself.
  if (state.registering) return;
  loadSession(user);
});

render();

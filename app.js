import {
  applyToMission, auth, createInterview, createMission, createProposal,
  getDocumentsForCandidate, getSessionProfile, loadWorkspace, login, logout,
  onAuthStateChanged, register, resetPassword, respondToProposal, saveCandidateProfile,
  saveCompanyProfile, updateApplication, updateCompanyStatus, updateMissionStatus,
  uploadStorageDocument, uploadCloudinaryDocument
} from './firebase.js';

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
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/></svg>'
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
  page: 'dashboard', query: '', filter: 'all', sectorFilter: 'all', authMode: 'login', loading: true, driveConnected: null
};

const nav = {
  admin: [
    ['dashboard', 'grid', 'Vue d\'ensemble'],
    ['missions', 'briefcase', 'Missions'],
    ['applications', 'users', 'Candidatures'],
    ['candidates', 'user', 'Candidats'],
    ['companies', 'building', 'Entreprises'],
    ['interviews', 'calendar', 'Entretiens']
  ],
  candidate: [
    ['dashboard', 'grid', 'Vue d\'ensemble'],
    ['missions', 'search', 'Trouver une mission'],
    ['applications', 'file', 'Mes candidatures'],
    ['profile', 'user', 'Mon profil']
  ],
  company: [
    ['dashboard', 'grid', 'Vue d\'ensemble'],
    ['missions', 'briefcase', 'Mes missions'],
    ['proposals', 'users', 'Profils proposés'],
    ['profile', 'building', 'Mon entreprise']
  ]
};

const missionStatus = { pending: 'À valider', published: 'Publiée', suspended: 'Suspendue', closed: 'Clôturée' };
const applicationStatus = { pending: 'En attente', reviewing: 'En cours d\'examen', interview: 'Entretien prévu', presented: 'Présenté au client', accepted: 'Accepté', rejected: 'Refusé' };
const proposalStatus = { pending: 'Réponse attendue', accepted: 'Accepté', rejected: 'Refusé' };

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
    'auth/invalid-credential': 'Email ou mot de passe incorrect.',
    'auth/email-already-in-use': 'Cet email est déjà utilisé.',
    'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
    'auth/invalid-email': 'Adresse email invalide.',
    'auth/too-many-requests': 'Trop de tentatives. Réessayez plus tard.',
    'permission-denied': 'Action refusée par les règles de sécurité Firebase.'
  };
  return messages[error.code] || error.message || 'Une erreur est survenue.';
}

function loadingScreen() {
  return `<div class="loading-screen"><div class="brand"><span class="brand-mark">I</span> Interim.</div><div class="spinner"></div><p>Connexion sécurisée...</p></div>`;
}

function authScreen() {
  const reg = state.authMode === 'register';
  return `<main class="auth-shell">
    <section class="auth-aside"><a class="brand brand-inverse"><span class="brand-mark">I</span> Interim.</a><div><div class="eyebrow" style="color:var(--lime)">Recrutement humain</div><h1>Les bonnes personnes,<br>au bon moment.</h1><p>L'administrateur qualifie chaque candidature et reste l'intermédiaire unique entre candidats et entreprises.</p></div><small>Les coordonnées privées ne sont jamais transmises directement.</small></section>
    <section class="auth-panel"><div class="auth-card"><div class="eyebrow">Accès sécurisé</div><h2>${reg ? 'Créer votre compte' : 'Bienvenue'}</h2><p>${reg ? 'Choisissez votre espace pour commencer.' : 'Connectez-vous à votre espace Interim.'}</p>
      <form id="auth-form" class="form-grid auth-form">
        ${reg ? `<div class="field full"><label>Type de compte</label><select name="role" id="register-role"><option value="candidate">Candidat</option><option value="company">Entreprise</option></select></div><div class="field full company-only" hidden><label>Nom de l'entreprise</label><input name="companyName"></div><div class="field"><label>Nom et prénom du contact</label><input name="name" required></div><div class="field"><label>Téléphone</label><input name="phone" required></div><div class="field"><label>Ville</label><input name="city" required></div><div class="field company-only" hidden><label>SIRET (optionnel)</label><input name="siret"></div>` : ''}
        <div class="field full"><label>Email</label><input name="email" type="email" autocomplete="email" required></div>
        <div class="field full"><label>Mot de passe</label><input name="password" type="password" minlength="6" autocomplete="${reg ? 'new-password' : 'current-password'}" required></div>
        <button class="btn btn-primary full submit-btn">${reg ? 'Créer mon compte' : 'Se connecter'}</button>
      </form>
      ${!reg ? '<button class="link auth-link" id="reset-password">Mot de passe oublié ?</button>' : ''}
      <div class="auth-switch">${reg ? 'Déjà inscrit ?' : 'Pas encore de compte ?'} <button class="link" id="auth-toggle">${reg ? 'Se connecter' : 'Créer un compte'}</button></div>
    </div></section>
  </main>`;
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
  const label = s.role === 'admin' ? 'Administration' : s.role === 'candidate' ? 'Espace candidat' : 'Espace entreprise';
  const pendingNotice = s.role === 'company' && s.status === 'pending' ? '<div class="notice">Votre entreprise attend la validation. Vous pouvez compléter le profil et preparer une mission.</div>' : '';
  return `<div class="shell"><header class="topbar"><a class="brand" data-page="dashboard"><span class="brand-mark">I</span> Interim<span style="color:var(--green)">.</span></a><div class="top-actions"><button class="icon-btn" data-toast="Vos notifications apparaîtront ici">${icons.bell}</button><div class="avatar" title="${esc(s.displayName)}">${initials(s.displayName)}</div></div></header><div class="layout"><aside class="sidebar"><div class="nav-label">${label}</div><nav class="nav">${navHtml}</nav><button class="logout-btn" id="logout">${icons.logout}<span>Se déconnecter</span></button></aside><main class="main">${pendingNotice}${content}</main></div><nav class="mobile-nav">${navHtml}</nav></div>`;
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
    return `<div class="page-head"><div><div class="eyebrow">Espace candidat</div><h1>Bonjour ${esc(s.displayName.split(' ')[0])}.</h1><p>Suivez vos candidatures et découvrez les missions publiées.</p></div><button class="btn btn-primary" data-page="missions">${icons.search}<span>Voir les missions</span></button></div><section class="stats">${stat('file', w.applications.length, 'Candidatures')}${stat('calendar', w.interviews.length, 'Entretiens')}${stat('briefcase', w.missions.length, 'Missions disponibles')}${stat('user', score + '%', 'Profil complété')}</section><div class="grid-2"><section class="card"><div class="card-head"><h2>Mes candidatures récentes</h2><button class="link" data-page="applications">Voir tout →</button></div>${w.applications.length ? `<div class="mission-list">${w.applications.slice(0, 4).map(applicationCard).join('')}</div>` : empty('Aucune candidature pour le moment.')}</section><aside><section class="card"><div class="card-head"><h2>Mon profil</h2><strong style="color:var(--green)">${score}%</strong></div><div class="progress"><span style="width:${score}%"></span></div><p class="muted-block">Complétez vos compétences, votre expérience et vos disponibilités pour faciliter la qualification.</p><button class="btn btn-light" data-page="profile">Compléter mon profil</button></section></aside></div>`;
  }
  if (s.role === 'company') {
    return `<div class="page-head"><div><div class="eyebrow">Espace entreprise</div><h1>Bonjour ${esc(s.displayName)}.</h1><p>Suivez les missions et les profils sélectionnés par l'administrateur.</p></div>${s.status === 'active' ? `<button class="btn btn-primary" data-modal="mission">${icons.plus}<span>Créer une mission</span></button>` : ''}</div><section class="stats">${stat('briefcase', w.missions.length, 'Missions')}${stat('users', w.proposals.length, 'Profils proposés')}${stat('clock', w.proposals.filter(p => p.response === 'pending').length, 'Réponses attendues')}${stat('check', w.proposals.filter(p => p.response === 'accepted').length, 'Profils acceptés')}</section><section class="card"><div class="card-head"><h2>Missions récentes</h2><button class="link" data-page="missions">Voir tout →</button></div>${w.missions.length ? `<div class="mission-list">${w.missions.slice(0, 5).map(missionCard).join('')}</div>` : empty(s.status === 'active' ? 'Créez votre première mission.' : 'La création sera disponible après validation du compte.')}</section>`;
  }
  return `<div class="page-head"><div><div class="eyebrow">Administration</div><h1>Vue d'ensemble</h1><p>Les éléments qui nécessitent votre intervention.</p></div><button class="btn btn-primary" data-modal="mission">${icons.plus}<span>Nouvelle mission</span></button></div><section class="stats">${stat('briefcase', w.missions.filter(m => m.status === 'pending').length, 'Missions à valider')}${stat('file', w.applications.filter(a => a.status === 'pending').length, 'Candidatures à traiter')}${stat('user', w.profiles.length, 'Candidats inscrits')}${stat('briefcase', w.missions.filter(m => m.status === 'published').length, 'Missions publiées')}</section><div class="grid-2"><section class="card"><div class="card-head"><h2>Missions à valider</h2><button class="link" data-page="missions">Voir tout →</button></div>${w.missions.some(m => m.status === 'pending') ? `<div class="mission-list">${w.missions.filter(m => m.status === 'pending').slice(0, 5).map(missionCard).join('')}</div>` : empty('Aucune mission en attente.')}</section><aside><section class="card"><div class="card-head"><h2>Actions prioritaires</h2></div><div class="checklist"><button class="action-line" data-page="applications"><span>${w.applications.filter(a => a.status === 'pending').length}</span> candidatures à analyser</button><button class="action-line" data-page="candidates"><span>${w.profiles.length}</span> candidats inscrits</button><button class="action-line" data-page="companies"><span>${w.companies.filter(c => c.status === 'pending').length}</span> entreprises à valider</button><button class="action-line" data-page="missions"><span>${w.missions.filter(m => m.status === 'published').length}</span> missions publiées</button></div></section><section class="card"><div class="card-head"><h2>Documents candidats</h2>${badge('Cloudinary', 'green')}</div><p class="muted-block">Les CV et documents sont stockés sur Cloudinary. Consultez-les depuis les fiches candidats et les candidatures.</p><button class="btn btn-light" data-page="candidates">${icons.user}<span>Voir les candidats</span></button></section></aside></div>`;
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
  return `<div class="page-head"><div><div class="eyebrow">Missions</div><h1>${isCandidate ? 'Trouver une mission' : 'Gestion des missions'}</h1><p>${isCandidate ? 'L\'identité de l\'entreprise reste confidentielle pendant la sélection.' : 'Créez et suivez chaque besoin de recrutement.'}</p></div>${canCreate ? `<button class="btn btn-primary" data-modal="mission">${icons.plus}<span>Nouvelle mission</span></button>` : ''}</div><div class="toolbar"><label class="search">${icons.search}<input id="search" value="${esc(state.query)}" placeholder="Métier, ville, secteur..."></label><div class="filters"><select class="select" id="sector-filter"><option value="all">Tous les secteurs</option>${sectorOpts}</select>${!isCandidate ? `<select class="select" id="status-filter"><option value="all">Tous les statuts</option>${statusOpts}</select>` : ''}</div></div><section class="card"><div class="card-head"><h2>${visible.length} mission${visible.length > 1 ? 's' : ''}</h2></div>${visible.length ? `<div class="mission-list">${visible.map(missionCard).join('')}</div>` : empty('Aucune mission ne correspond à votre recherche.')}</section>`;
}

function applicationCard(application) {
  return `<article class="mission"><div><h3>${esc(application.missionTitle)}</h3><div class="meta"><span>${icons.building} Entreprise confidentielle</span><span>${icons.map} ${esc(application.city)}</span><span>${icons.clock} ${dateText(application.createdAt)}</span></div></div>${badge(label(applicationStatus, application.status))}</article>`;
}

function applicationsPage() {
  const applications = state.workspace.applications;
  if (state.session.role === 'candidate') {
    return `<div class="page-head"><div><div class="eyebrow">Suivi</div><h1>Mes candidatures</h1><p>Les changements de statut sont affichés ici.</p></div></div><section class="card">${applications.length ? `<div class="mission-list">${applications.map(applicationCard).join('')}</div>` : empty('Vous n\'avez pas encore postulé.')}</section>`;
  }
  const rows = applications.map((a) => `<tr>
    <td><strong>${esc(a.candidateName)}</strong></td>
    <td>${esc(a.missionTitle)}</td>
    <td>${dateText(a.createdAt)}</td>
    <td class="notes-cell">${a.internalNotes ? `<span class="note-preview" title="${esc(a.internalNotes)}">${esc(a.internalNotes.substring(0, 40))}${a.internalNotes.length > 40 ? '…' : ''}</span>` : '<span style="color:var(--muted)">—</span>'}</td>
    <td><select class="select" data-application-status="${a.id}">${Object.entries(applicationStatus).map(([k, v]) => `<option value="${k}" ${a.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
    <td><div class="row"><button class="btn btn-light btn-small" data-candidate="${a.id}">${icons.file} Profil & CV</button><button class="btn btn-light btn-small" data-interview="${a.id}">Entretien</button><button class="btn btn-primary btn-small" data-propose="${a.id}">Présenter</button></div></td>
  </tr>`).join('');
  return `<div class="page-head"><div><div class="eyebrow">Qualification</div><h1>Candidatures</h1><p>Consultez les profils et CV, planifiez les entretiens, puis présentez les meilleurs candidats.</p></div></div><div class="table-wrap"><table><thead><tr><th>Candidat</th><th>Mission</th><th>Date</th><th>Notes internes</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function candidatesPage() {
  const profiles = state.workspace.profiles;
  const rows = profiles.length ? profiles.map((p) => {
    const pct = profileScore(p);
    return `<tr>
      <td><div class="person"><div class="anon-avatar" style="flex-shrink:0">${initials(p.name || '?')}</div><div><strong>${esc(p.name || '—')}</strong><span>${esc(p.phone || '')}</span></div></div></td>
      <td>${esc(p.city || '—')}</td>
      <td><div class="tags" style="margin:0">${(p.skills || []).slice(0, 3).map(s => `<span class="tag">${esc(s)}</span>`).join('')}${(p.skills || []).length > 3 ? `<span class="tag">+${(p.skills || []).length - 3}</span>` : ''}</div></td>
      <td>${esc(p.availability || '—')}</td>
      <td><div class="progress" style="width:72px;height:5px;margin-bottom:3px"><span style="width:${pct}%"></span></div><small style="color:var(--muted);font-size:10px">${pct}%</small></td>
      <td><button class="btn btn-light btn-small" data-profile-candidate="${p.id}">Voir profil & CV</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted)">Aucun candidat inscrit.</td></tr>`;
  return `<div class="page-head"><div><div class="eyebrow">Base candidats</div><h1>Candidats</h1><p>Tous les profils candidats inscrits sur la plateforme.</p></div></div><div class="table-wrap"><table><thead><tr><th>Candidat</th><th>Ville</th><th>Compétences</th><th>Disponibilité</th><th>Profil</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function companiesPage() {
  const rows = state.workspace.companies.map((c) => {
    const isScraped = c.source === 'scraped';
    const action = isScraped
      ? `<a href="${esc(c.sourceUrl || '#')}" target="_blank" rel="noopener" class="btn btn-light btn-small">Voir le site</a>`
      : `<div class="row"><button class="btn btn-primary btn-small" data-company-status="${c.id}:active">Valider</button><button class="btn btn-light btn-small" data-company-status="${c.id}:rejected">Refuser</button></div>`;
    return `<tr>
    <td><strong>${esc(c.companyName)}</strong>${isScraped ? ` <span class="badge gray" style="font-size:9px">Importée</span>` : ''}</td>
    <td>${isScraped ? `<span style="color:var(--muted)">—</span>` : esc(c.contactName)}</td>
    <td>${esc(c.city || '—')}</td>
    <td>${isScraped ? `<span style="color:var(--muted)">—</span>` : esc(c.siret || 'Non renseigné')}</td>
    <td>${badge(c.status === 'active' ? 'Active' : c.status === 'rejected' ? 'Refusée' : 'En attente')}</td>
    <td>${action}</td>
  </tr>`;
  }).join('');
  return `<div class="page-head"><div><div class="eyebrow">Comptes clients</div><h1>Entreprises</h1><p>Validez les entreprises avant leur mise en relation.</p></div></div><div class="table-wrap"><table><thead><tr><th>Entreprise</th><th>Contact</th><th>Ville</th><th>SIRET</th><th>Statut</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
  return `<div class="page-head"><div><div class="eyebrow">Sélection Interim</div><h1>Profils proposés</h1><p>Les coordonnées personnelles restent masquées. Votre décision est transmise à l'administrateur.</p></div></div><section class="card">${proposals.length ? `<div class="candidate-list">${cards}</div>` : empty('Aucun profil proposé pour le moment.')}</section>`;
}

function interviewsPage() {
  const rows = state.workspace.interviews.map(i => `<tr>
    <td><strong>${esc(i.candidateName)}</strong></td>
    <td>${esc(i.missionTitle)}</td>
    <td>${esc(i.scheduledAt)}</td>
    <td>${esc(i.notes || 'À compléter')}</td>
    <td>${esc(i.score || '—')} / 5</td>
  </tr>`).join('');
  return `<div class="page-head"><div><div class="eyebrow">Qualification</div><h1>Entretiens</h1><p>Historique des entretiens planifiés et comptes-rendus.</p></div></div><div class="table-wrap"><table><thead><tr><th>Candidat</th><th>Mission</th><th>Date</th><th>Compte-rendu</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
  return `<div class="page-head"><div><div class="eyebrow">Informations</div><h1>${isCandidate ? 'Mon profil candidat' : 'Mon entreprise'}</h1><p>Ces informations sont accessibles uniquement à l'équipe administrateur.</p></div></div>
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
      ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="doc-link">${icons.file}<span><strong>${esc(type)}</strong> — ${esc(d.name || 'fichier')}</span></a>`
      : `<div class="doc-link doc-link-muted">${icons.file}<span><strong>${esc(type)}</strong> (stocké sur Google Drive)</span></div>`;
  }).join('')}</div>`;
}

async function candidateModal(application) {
  const profile = state.workspace.profiles.find(p => p.id === application.candidateId) || {};
  modal(`<div class="modal-head"><div><h2>${esc(application.candidateName)}</h2><p>${esc(application.missionTitle)}</p></div><button class="close" data-close>×</button></div>
    <div class="profile-detail">
      <div class="detail-row"><label>Ville</label><span>${esc(profile.city || '—')}</span></div>
      <div class="detail-row"><label>Disponibilité</label><span>${esc(profile.availability || '—')}</span></div>
      <div class="detail-row"><label>Téléphone</label><span>${esc(profile.phone || '—')}</span></div>
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
  modal(`<div class="modal-head"><div><h2>${esc(profile.name || 'Candidat')}</h2><p>${esc(profile.city || '')}</p></div><button class="close" data-close>×</button></div>
    <div class="profile-detail">
      <div class="detail-row"><label>Téléphone</label><span>${esc(profile.phone || '—')}</span></div>
      <div class="detail-row"><label>Disponibilité</label><span>${esc(profile.availability || '—')}</span></div>
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
  if (state.loading) { document.querySelector('#app').innerHTML = loadingScreen(); return; }
  if (!state.session) { document.querySelector('#app').innerHTML = authScreen(); bind(); return; }
  const pages = {
    dashboard, missions: missionsPage, applications: applicationsPage,
    candidates: candidatesPage, companies: companiesPage, proposals: proposalsPage,
    interviews: interviewsPage, profile: profilePage
  };
  const content = (pages[state.page] || dashboard)();
  document.querySelector('#app').innerHTML = shell(content);
  bind();
}

async function refresh(message) {
  state.workspace = await loadWorkspace(state.session);
  render();
  if (message) toast(message);
}

function modal(content) {
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop"><div class="modal">${content}</div></div>`);
  document.querySelectorAll('[data-close]').forEach(el => el.onclick = () => document.querySelector('.modal-backdrop')?.remove());
}

function missionModal() {
  const sectorOpts = SECTORS.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  const isCompany = state.session.role === 'company';
  modal(`<div class="modal-head"><div><h2>Créer une mission</h2><p>${isCompany ? 'Elle sera publiée après validation administrative.' : 'La mission sera publiée immédiatement.'}</p></div><button class="close" data-close>×</button></div>
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
  modal(`<div class="modal-head"><div><h2>Planifier un entretien</h2><p>${esc(application.candidateName)} · ${esc(application.missionTitle)}</p></div><button class="close" data-close>×</button></div>
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
  document.querySelector('#auth-toggle')?.addEventListener('click', () => { state.authMode = state.authMode === 'login' ? 'register' : 'login'; render(); });
  document.querySelector('#register-role')?.addEventListener('change', (e) => document.querySelectorAll('.company-only').forEach(el => el.hidden = e.target.value !== 'company'));
  document.querySelector('#auth-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('.submit-btn');
    button.disabled = true;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try { if (state.authMode === 'register') await register(values); else await login(values.email, values.password); }
    catch (error) { toast(errorMessage(error), true); button.disabled = false; }
  });
  document.querySelector('#reset-password')?.addEventListener('click', async () => {
    const email = document.querySelector('[name=email]').value;
    if (!email) return toast('Saisissez votre email.', true);
    try { await resetPassword(email); toast('Email de réinitialisation envoyé.'); } catch (error) { toast(errorMessage(error), true); }
  });
  document.querySelector('#logout')?.addEventListener('click', () => logout());
  document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => { state.page = el.dataset.page; state.query = ''; state.filter = 'all'; state.sectorFilter = 'all'; render(); }));
  document.querySelectorAll('[data-toast]').forEach(el => el.addEventListener('click', () => toast(el.dataset.toast)));
  document.querySelectorAll('[data-modal="mission"]').forEach(el => el.addEventListener('click', missionModal));
  document.querySelector('#search')?.addEventListener('input', (e) => { state.query = e.target.value; render(); document.querySelector('#search')?.focus(); });
  document.querySelector('#status-filter')?.addEventListener('change', (e) => { state.filter = e.target.value; render(); });
  document.querySelector('#sector-filter')?.addEventListener('change', (e) => { state.sectorFilter = e.target.value; render(); });
  document.querySelectorAll('[data-apply]').forEach(el => el.addEventListener('click', async () => {
    const mission = state.workspace.missions.find(m => m.id === el.dataset.apply);
    try { await applyToMission(state.session, mission); await refresh('Candidature envoyée à l\'administrateur.'); } catch (error) { toast(errorMessage(error), true); }
  }));
  document.querySelectorAll('[data-mission-status]').forEach(el => el.addEventListener('click', async () => {
    const [id, status] = el.dataset.missionStatus.split(':');
    try { await updateMissionStatus(id, status); await refresh('Statut de la mission mis à jour.'); } catch (error) { toast(errorMessage(error), true); }
  }));
  document.querySelectorAll('[data-application-status]').forEach(el => el.addEventListener('change', async () => {
    try { await updateApplication(el.dataset.applicationStatus, { status: el.value }); await refresh('Candidature mise à jour.'); } catch (error) { toast(errorMessage(error), true); }
  }));
  document.querySelectorAll('[data-company-status]').forEach(el => el.addEventListener('click', async () => {
    const [id, status] = el.dataset.companyStatus.split(':');
    try { await updateCompanyStatus(id, status); await refresh('Compte entreprise mis à jour.'); } catch (error) { toast(errorMessage(error), true); }
  }));
  document.querySelectorAll('[data-interview]').forEach(el => el.addEventListener('click', () => interviewModal(state.workspace.applications.find(a => a.id === el.dataset.interview))));
  document.querySelectorAll('[data-propose]').forEach(el => el.addEventListener('click', () => propose(state.workspace.applications.find(a => a.id === el.dataset.propose))));
  document.querySelectorAll('[data-candidate]').forEach(el => el.addEventListener('click', () => candidateModal(state.workspace.applications.find(a => a.id === el.dataset.candidate))));
  document.querySelectorAll('[data-profile-candidate]').forEach(el => el.addEventListener('click', () => candidateProfileModal(state.workspace.profiles.find(p => p.id === el.dataset.profileCandidate))));
  document.querySelectorAll('[data-proposal-response]').forEach(el => el.addEventListener('click', async () => {
    const [id, response] = el.dataset.proposalResponse.split(':');
    try { await respondToProposal(id, response); await refresh('Votre réponse a été transmise à l\'administrateur.'); } catch (error) { toast(errorMessage(error), true); }
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
}

onAuthStateChanged(auth, async (user) => {
  state.loading = true; render();
  if (!user) { state.session = null; state.loading = false; render(); return; }
  try {
    state.session = await getSessionProfile(user);
    state.workspace = await loadWorkspace(state.session);
    state.page = 'dashboard';
  } catch (error) { toast(errorMessage(error), true); await logout(); }
  state.loading = false;
  render();
});

render();

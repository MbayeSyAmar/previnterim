const { randomBytes } = require('node:crypto');
const { Readable } = require('node:stream');
const Busboy = require('busboy');
const cheerio = require('cheerio');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { google } = require('googleapis');

initializeApp();

const db = getFirestore();
const driveClientSecret = defineSecret('GOOGLE_DRIVE_CLIENT_SECRET');
const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;
const appUrl = process.env.APP_URL;
const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const maxFileSize = 10 * 1024 * 1024;

// ── Helpers ───────────────────────────────────────────────────────────────────

function oauthClient() {
  return new google.auth.OAuth2(clientId, driveClientSecret.value(), redirectUri);
}

function json(res, status, payload) {
  res.status(status).set('Cache-Control', 'no-store').json(payload);
}

function cors(req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Max-Age', '3600');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

async function authenticatedUser(req) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) throw Object.assign(new Error('Authentification requise.'), { status: 401 });
  const decoded = await getAuth().verifyIdToken(header.slice(7));
  const user = await db.doc(`users/${decoded.uid}`).get();
  if (!user.exists) throw Object.assign(new Error('Profil utilisateur introuvable.'), { status: 403 });
  return { uid: decoded.uid, ...user.data() };
}

async function driveCredentials() {
  const snapshot = await db.doc('serverOnly/googleDrive').get();
  if (!snapshot.exists || !snapshot.data().refreshToken) {
    throw Object.assign(new Error("Google Drive n'est pas encore connecté par un administrateur."), { status: 503 });
  }
  return snapshot.data();
}

async function parseUpload(req) {
  return new Promise((resolve, reject) => {
    const parser = Busboy({ headers: req.headers, limits: { files: 1, fileSize: maxFileSize, fields: 3 } });
    const fields = {};
    let file;
    parser.on('field', (name, value) => { fields[name] = value; });
    parser.on('file', (_name, stream, info) => {
      const chunks = [];
      let truncated = false;
      stream.on('limit', () => { truncated = true; });
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        if (truncated) return reject(Object.assign(new Error('Fichier supérieur à 10 Mo.'), { status: 413 }));
        file = { buffer: Buffer.concat(chunks), filename: info.filename, mimeType: info.mimeType };
      });
    });
    parser.on('error', reject);
    parser.on('finish', () => file ? resolve({ fields, file }) : reject(Object.assign(new Error('Aucun fichier reçu.'), { status: 400 })));
    parser.end(req.rawBody);
  });
}

// ── Drive handlers ────────────────────────────────────────────────────────────

async function connectDrive(req, res) {
  const user = await authenticatedUser(req);
  if (user.role !== 'admin') return json(res, 403, { error: "Action réservée à l'administrateur." });
  const state = randomBytes(32).toString('hex');
  await db.doc(`serverOnlyOauthStates/${state}`).set({ uid: user.uid, expiresAt: Date.now() + 10 * 60 * 1000 });
  const url = oauthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/drive'], state });
  return json(res, 200, { url });
}

async function driveCallback(req, res) {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${appUrl}/?drive=error`);
  if (!code || !state) return json(res, 400, { error: 'Réponse OAuth invalide.' });
  const stateRef = db.doc(`serverOnlyOauthStates/${state}`);
  const stateSnapshot = await stateRef.get();
  if (!stateSnapshot.exists || stateSnapshot.data().expiresAt < Date.now()) return json(res, 400, { error: 'Session OAuth expirée.' });
  await stateRef.delete();
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) return json(res, 400, { error: "Google n'a pas fourni de jeton permanent. Révoquez l'accès puis recommencez." });
  await db.doc('serverOnly/googleDrive').set({ refreshToken: tokens.refresh_token, scope: tokens.scope || '', connectedBy: stateSnapshot.data().uid, connectedAt: FieldValue.serverTimestamp() });
  return res.redirect(`${appUrl}/?drive=connected`);
}

async function driveStatus(req, res) {
  const user = await authenticatedUser(req);
  if (user.role !== 'admin') return json(res, 403, { error: "Action réservée à l'administrateur." });
  const credentials = await db.doc('serverOnly/googleDrive').get();
  return json(res, 200, { connected: credentials.exists && Boolean(credentials.data().refreshToken) });
}

async function uploadDocument(req, res) {
  const user = await authenticatedUser(req);
  if (!['candidate', 'admin'].includes(user.role)) return json(res, 403, { error: 'Action non autorisée.' });
  const { fields, file } = await parseUpload(req);
  if (!allowedTypes.has(file.mimeType)) return json(res, 415, { error: 'Formats autorisés : PDF, JPG et PNG.' });
  const candidateId = user.role === 'admin' ? fields.candidateId : user.uid;
  if (!candidateId) return json(res, 400, { error: 'Candidat manquant.' });
  const candidate = await db.doc(`candidateProfiles/${candidateId}`).get();
  if (!candidate.exists) return json(res, 404, { error: 'Profil candidat introuvable.' });
  const credentials = await driveCredentials();
  const client = oauthClient();
  client.setCredentials({ refresh_token: credentials.refreshToken });
  const drive = google.drive({ version: 'v3', auth: client });
  const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const driveFile = await drive.files.create({
    requestBody: { name: `${candidateId}_${Date.now()}_${safeName}`, parents: [folderId], appProperties: { candidateId, uploadedBy: user.uid, documentType: fields.documentType || 'other' } },
    media: { mimeType: file.mimeType, body: Readable.from(file.buffer) },
    fields: 'id,name,mimeType,createdTime,webViewLink'
  });
  const document = { candidateId, driveFileId: driveFile.data.id, name: driveFile.data.name, mimeType: driveFile.data.mimeType, documentType: fields.documentType || 'other', uploadedBy: user.uid, createdAt: FieldValue.serverTimestamp() };
  const documentRef = await db.collection('candidateDocuments').add(document);
  await db.doc(`candidateProfiles/${candidateId}`).set({ documentProvider: 'google-drive', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return json(res, 201, { id: documentRef.id, name: driveFile.data.name, documentType: document.documentType });
}

exports.api = onRequest({ region: 'europe-west1', secrets: [driveClientSecret], timeoutSeconds: 120, memory: '512MiB' }, async (req, res) => {
  try {
    if (cors(req, res)) return;
    const path = req.path.replace(/^\/api/, '');
    if (req.method === 'POST' && path === '/drive/connect') return await connectDrive(req, res);
    if (req.method === 'GET' && path === '/drive/callback') return await driveCallback(req, res);
    if (req.method === 'GET' && path === '/drive/status') return await driveStatus(req, res);
    if (req.method === 'POST' && path === '/drive/upload') return await uploadDocument(req, res);
    if (req.method === 'POST' && path === '/scrape') {
      const user = await authenticatedUser(req);
      if (user.role !== 'admin') return json(res, 403, { error: 'Réservé à l\'administrateur.' });
      let totalAdded = 0;
      for (const source of SOURCES) {
        try { totalAdded += await scrapeSource(source); } catch (err) { console.error(`[${source.id}] ${err.message}`); }
      }
      const deleted = await cleanOldScrapedJobs();
      return json(res, 200, { added: totalAdded, deleted });
    }
    return json(res, 404, { error: 'Route inconnue.' });
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, { error: error.message || 'Erreur serveur.' });
  }
});

// ── Scraper ───────────────────────────────────────────────────────────────────

const SCRAPE_TTL_DAYS = 5;
const BOT_UA = 'Mozilla/5.0 (compatible; InterimSN-Bot/1.0; +https://gerart-6cdc1.web.app)';

// Sources à scraper chaque jour
const SOURCES = [
  {
    id: 'seninterim',
    name: 'Sen Interim',
    url: 'https://seninterim.sn/index.php/jobs-default/',
    city: 'Dakar',
    parse: parseSenInterim
  },
  {
    id: 'snjob',
    name: 'SN Job',
    url: 'https://www.snjob.sn/emplois',
    city: 'Dakar',
    parse: parseGeneric
  },
  {
    id: 'emploisenegal',
    name: 'Emploi Sénégal',
    url: 'https://www.emploisenegal.com/offres-emploi/',
    city: 'Dakar',
    parse: parseGeneric
  },
  {
    id: 'elaninterim',
    name: 'Elan Interim',
    url: 'https://elaninterim.sn/nos-offres/',
    city: 'Dakar',
    parse: parseGeneric
  },
  {
    id: 'humanis',
    name: 'Humanis Interim',
    url: 'https://www.humanis-sn.com/offres-emploi/',
    city: 'Dakar',
    parse: parseGeneric
  },
  {
    id: 'afriquerh',
    name: 'Afrique RH',
    url: 'https://www.afriquerh.sn/offres-demploi/',
    city: 'Dakar',
    parse: parseGeneric
  }
];

// Détection du secteur à partir du titre/description
function detectSector(text) {
  if (/informatique|développeur|dev\b|web|réseau|data|logiciel|it\b|digital|système|cyber/i.test(text)) return 'Informatique / Numérique';
  if (/btp|construction|bâtiment|génie civil|maçon|charpentier|plombier|électricien|travaux/i.test(text)) return 'BTP / Construction';
  if (/transport|logistique|chauffeur|livreur|magasinier|stock|supply|transit|douane/i.test(text)) return 'Transport / Logistique';
  if (/industrie|production|opérateur|usine|manufactur|maintenance|technicien/i.test(text)) return 'Industrie / Production';
  if (/santé|médecin|infirmier|pharmacie|hôpital|soin|sage-femme|dentiste/i.test(text)) return 'Santé / Social';
  if (/hôtel|restaurant|cuisine|cuisinier|serveur|réceptionniste|tourisme|accueil/i.test(text)) return 'Hôtellerie / Restauration';
  if (/comptabl|finance|audit|fiscalit|contrôleur|trésor|bilan|expert-comptable/i.test(text)) return 'Finance / Comptabilité';
  if (/commerce|vente|commercial|vendeur|marketing|clientèle|représentant|achat/i.test(text)) return 'Tertiaire / Commerce';
  if (/agriculture|élevage|agroalimentaire|pêche|agronome|récolte/i.test(text)) return 'Agriculture / Agroalimentaire';
  if (/formation|éducation|enseignant|professeur|formateur|école|université/i.test(text)) return 'Éducation / Formation';
  return 'Autre';
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': BOT_UA, 'Accept-Language': 'fr-FR,fr;q=0.9' },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Parser spécifique seninterim.sn (Joomla K2 / JS Jobs)
function parseSenInterim(html) {
  const $ = cheerio.load(html);
  const jobs = [];

  // Essaye les sélecteurs typiques des extensions Joomla job board
  const selectors = [
    '.jsjobs-job-item', '.jsj-item', '.job-item',
    '.k2Item', 'article.post', '.cat-list-row0', '.cat-list-row1',
    'li.item', '.item-page'
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const $el = $(el);
      const title = $el.find('h2 a, h3 a, .jsjobs-job-title a, .itemTitle a, [class*="title"] a').first().text().trim()
                 || $el.find('h2, h3').first().text().trim();
      const city = $el.find('[class*="locat"], [class*="lieu"], [class*="city"], [class*="ville"]').text().trim();
      const desc = $el.find('.introtext, .itemIntroText, [class*="desc"], p').first().text().trim().slice(0, 600);
      const contract = $el.find('[class*="contract"], [class*="contrat"], [class*="type-poste"]').text().trim();
      if (title && title.length > 4) {
        jobs.push({ title, city: city || 'Dakar', description: desc, contractType: contract || 'Intérim' });
      }
    });
    if (jobs.length) break;
  }

  // Fallback générique si aucun sélecteur ne matche
  if (!jobs.length) return parseGeneric(html);
  return jobs.slice(0, 60);
}

// Parser générique multi-sites
function parseGeneric(html) {
  const $ = cheerio.load(html);
  const jobs = [];

  // Essaye plusieurs patterns de job boards
  const containers = $([
    'article', '.job', '.offre', '.offer', '.poste', '.annonce',
    '[class*="job-item"]', '[class*="offre-item"]', '[class*="listing-item"]',
    '.views-row', '.view-row', '.field-content'
  ].join(','));

  containers.each((_, el) => {
    const $el = $(el);
    const title = $el.find('h1 a, h2 a, h3 a, h4 a, [class*="title"] a').first().text().trim()
               || $el.find('h2, h3, h4').first().text().trim();
    const city = $el.find('[class*="locat"], [class*="lieu"], [class*="city"], [class*="ville"]').text().trim();
    const desc = $el.find('p, [class*="desc"], [class*="intro"], [class*="excerpt"]').first().text().trim().slice(0, 600);
    const contract = $el.find('[class*="contract"], [class*="type"], [class*="contrat"]').text().trim();

    if (title && title.length > 5 && title.length < 160) {
      jobs.push({ title, city: city || 'Dakar', description: desc, contractType: contract || 'Intérim' });
    }
  });

  // Fallback encore plus générique : liens qui ressemblent à des offres
  if (!jobs.length) {
    $('a[href*="offre"], a[href*="job"], a[href*="emploi"], a[href*="poste"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 8 && text.length < 150) {
        jobs.push({ title: text, city: 'Dakar', description: '', contractType: 'Intérim' });
      }
    });
  }

  return [...new Map(jobs.map(j => [j.title.toLowerCase(), j])).values()].slice(0, 60);
}

// Crée ou retourne l'ID de la société scrapée dans Firestore
async function ensureScrapedCompany(source) {
  const id = `scraped_${source.id}`;
  const ref = db.doc(`companies/${id}`);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      companyName: source.name,
      contactName: 'Voir le site source',
      phone: '',
      city: source.city || 'Dakar',
      siret: '',
      status: 'active',
      source: 'scraped',
      sourceId: source.id,
      sourceUrl: source.url,
      updatedAt: FieldValue.serverTimestamp()
    });
    console.log(`[scraper] Company created: ${source.name}`);
  }
  return id;
}

// Scrape une source et écrit les nouvelles offres dans Firestore
async function scrapeSource(source) {
  const html = await fetchHtml(source.url);
  const jobs = source.parse(html);
  if (!jobs.length) {
    console.log(`[${source.id}] 0 jobs parsed`);
    return 0;
  }

  const companyId = await ensureScrapedCompany(source);

  // Titres déjà existants pour cette source (éviter doublons)
  const existing = await db.collection('missions').where('source', '==', source.id).get();
  const existingKeys = new Set(existing.docs.map(d => (d.data().title || '').toLowerCase().trim()));

  let added = 0;
  for (const job of jobs) {
    const key = job.title.toLowerCase().trim();
    if (existingKeys.has(key)) continue;

    const sector = detectSector(`${job.title} ${job.description}`);
    await db.collection('missions').add({
      title: job.title,
      city: job.city || source.city || 'Dakar',
      description: job.description || '',
      contractType: job.contractType || 'Intérim',
      duration: 'Non précisé',
      pay: 'Selon profil (FCFA)',
      sector,
      companyId,
      companyName: source.name,
      status: 'published',
      source: source.id,
      sourceUrl: source.url,
      scrapedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    added++;
  }

  console.log(`[${source.id}] +${added} new (${jobs.length} parsed, ${existing.size} already stored)`);
  return added;
}

// Supprime les offres scrapées de plus de SCRAPE_TTL_DAYS jours
async function cleanOldScrapedJobs() {
  const cutoff = new Date(Date.now() - SCRAPE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const old = await db.collection('missions').where('scrapedAt', '<', cutoff).get();
  if (old.empty) return 0;

  // Firestore batch limite à 500 opérations
  for (let i = 0; i < old.docs.length; i += 500) {
    const batch = db.batch();
    old.docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  console.log(`[scraper] Deleted ${old.docs.length} old scraped missions`);
  return old.docs.length;
}

// Scrape quotidien à 6h heure de Dakar
exports.dailyScrape = onSchedule({
  schedule: '0 6 * * *',
  timeZone: 'Africa/Dakar',
  region: 'europe-west1',
  memory: '512MiB',
  timeoutSeconds: 300
}, async () => {
  console.log('=== Démarrage du scrape quotidien ===');
  let totalAdded = 0;

  for (const source of SOURCES) {
    try {
      totalAdded += await scrapeSource(source);
    } catch (err) {
      console.error(`[${source.id}] Erreur : ${err.message}`);
    }
  }

  const deleted = await cleanOldScrapedJobs();
  console.log(`=== Scrape terminé : +${totalAdded} ajoutées, ${deleted} supprimées ===`);
});

// Endpoint manuel pour déclencher le scrape (admin seulement)
exports.triggerScrape = onRequest({ region: 'europe-west1', timeoutSeconds: 300, memory: '512MiB' }, async (req, res) => {
  try {
    if (cors(req, res)) return;
    const user = await authenticatedUser(req);
    if (user.role !== 'admin') return json(res, 403, { error: "Réservé à l'administrateur." });

    let totalAdded = 0;
    for (const source of SOURCES) {
      try { totalAdded += await scrapeSource(source); }
      catch (err) { console.error(`[${source.id}] ${err.message}`); }
    }
    const deleted = await cleanOldScrapedJobs();
    return json(res, 200, { added: totalAdded, deleted });
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, { error: error.message || 'Erreur serveur.' });
  }
});

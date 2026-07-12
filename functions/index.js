const { randomBytes } = require('node:crypto');
const { Readable } = require('node:stream');
const Busboy = require('busboy');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');
const { onRequest } = require('firebase-functions/v2/https');
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
    return json(res, 404, { error: 'Route inconnue.' });
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, { error: error.message || 'Erreur serveur.' });
  }
});

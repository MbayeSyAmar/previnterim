# Interim

SPA Firebase pour la gestion de missions, candidatures, entretiens et présentations de profils.

## Activation Firebase

Dans la console Firebase du projet `gerart-6cdc1` :

1. Authentication > Sign-in method : activer **Email/Password**.
2. Firestore Database : créer la base en mode production.
3. Storage : créer le bucket si un stockage Firebase de secours est souhaité.
4. Installer Firebase CLI, se connecter, puis exécuter à la racine :

```bash
firebase login
firebase functions:secrets:set GOOGLE_DRIVE_CLIENT_SECRET
firebase deploy --only firestore:rules,storage,functions,hosting
```

La commande `functions:secrets:set` demande le **nouveau** secret OAuth dans le terminal. Ne le placez jamais dans un fichier du projet.

Le déploiement de Cloud Functions nécessite généralement le plan Firebase Blaze.

## Google Drive

Configuration intégrée :

- Dossier Drive : `1qt53zcdp_sWhBtFMfKCuoyKJqfxP1qMr`
- Client OAuth : `196716187308-3nnk952gf5ktod88vreuqsanf1cbe6qe.apps.googleusercontent.com`
- Redirection : `https://gerart-6cdc1.web.app/api/drive/callback`

Dans Google Cloud Console :

1. Révoquer le secret OAuth qui a été communiqué dans une conversation et en générer un nouveau.
2. Activer Google Drive API.
3. Ajouter exactement l’URL de redirection ci-dessus au client OAuth Web.
4. Configurer l’écran de consentement OAuth et ajouter le compte Google administrateur comme utilisateur test tant que l’application n’est pas publiée.
5. Après déploiement, se connecter avec le compte administrateur et cliquer sur **Connecter Google Drive**.

L’application demande l’accès Drive pour pouvoir écrire dans le dossier existant fourni. Une diffusion publique de cette intégration peut nécessiter la vérification OAuth de Google.

## Créer le premier administrateur

L’application interdit volontairement l’auto-inscription administrateur.

1. Créer un compte candidat avec l’email de l’administrateur.
2. Dans Firestore, ouvrir `users/{uid}`.
3. Remplacer `role: "candidate"` par `role: "admin"`.
4. Se déconnecter puis se reconnecter.

Cette opération doit être faite directement dans la console Firebase, jamais depuis le navigateur public.

## Documents

Les candidats peuvent envoyer des PDF, JPG et PNG de 10 Mo maximum. Les fichiers sont déposés par une Cloud Function authentifiée ; le navigateur ne reçoit ni secret OAuth ni jeton Drive.

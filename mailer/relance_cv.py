# -*- coding: utf-8 -*-
"""Relance les candidats qui n'ont pas depose de CV.

Un CV est desormais exige avant toute candidature. Les comptes crees avant ce
changement n'en ont pas forcement, et rien ne les en avertit tant qu'ils ne
tentent pas de postuler.

Le ciblage ne se fait pas sur `candidateProfiles`. Cette collection contient
aussi des fiches d'administrateurs et des fiches orphelines dont le compte
n'existe plus : au 2026-10-25, douze fiches pour cinq vrais candidats. Un envoi
fonde sur elle aurait ecrit a la direction et a des adresses d'essai. Le ciblage
part donc de `users` avec `role == 'candidate'`.

Le journal `serverOnlyMailLog` est partage avec mailer.py, donc une relance
n'est envoyee qu'une fois par candidat, meme si le script est rejoue. Passez
`--again` pour autoriser une seconde relance.

Usage :
    python relance_cv.py --dry-run
    python relance_cv.py
"""

from __future__ import annotations

import os
import sys

import firebase_admin
from firebase_admin import auth, credentials, firestore

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mailer as m  # noqa: E402  (reutilise le gabarit, l'envoi et le journal)

AGAIN = "--again" in sys.argv


def destinataires():
    """Candidats actifs, sans CV, avec une adresse."""
    sortie = []
    for d in m.db.collection("users").where(
            filter=firestore.FieldFilter("role", "==", "candidate")).stream():
        u = d.to_dict()
        if u.get("status") not in (None, "active"):
            continue
        if m.db.collection("candidateDocuments").document(f"{d.id}_cv").get().exists:
            continue

        email = u.get("email") or ""
        nom = u.get("displayName") or ""
        if not email:
            try:
                record = auth.get_user(d.id)
                email, nom = email or record.email or "", nom or record.display_name or ""
            except Exception:
                pass
        if not email:
            print(f"  ignore {d.id} : aucune adresse")
            continue

        candidatures = len(list(m.db.collection("applications").where(
            filter=firestore.FieldFilter("candidateId", "==", d.id)).stream()))
        sortie.append((d.id, email, nom, candidatures))
    return sortie


def relancer(email, nom, candidatures):
    prenom = (nom or "").split(" ")[0]
    deja = (
        f"Vous avez deja envoye {candidatures} candidature"
        f"{'s' if candidatures > 1 else ''}. Elle"
        f"{'s sont conservees' if candidatures > 1 else ' est conservee'}, "
        "mais notre equipe ne peut pas l'etudier sans votre CV."
        if candidatures else
        "Votre profil est bien cree, il ne manque que cette piece."
    )
    m.send(
        email,
        "Ajoutez votre CV pour pouvoir postuler",
        "Il manque votre CV",
        f"Bonjour{' ' + m.esc(prenom) if prenom else ''},<br><br>"
        f"Votre profil candidat ne contient pas encore de CV. {deja}<br><br>"
        "Le CV est desormais <strong>obligatoire pour postuler</strong> : sans lui, "
        "une candidature ne peut pas etre qualifiee, et le bouton Postuler reste bloque.",
        [("Ou le deposer", "Connectez-vous, ouvrez « Mon profil », "
                           "section « CV et documents », choisissez le type « CV » "
                           "et envoyez votre fichier."),
         ("Formats acceptes", "PDF, JPG ou PNG, 10 Mo au maximum"),
         ("Adresse du compte", email)],
        cta=("Deposer mon CV", m.APP_URL),
        to_name=nom or None,
        tag="relance-cv",
    )


def main() -> int:
    manquant = [k for k in ("BREVO_API_KEY", "MAIL_SENDER_EMAIL") if not os.environ.get(k)]
    if manquant and not m.DRY_RUN:
        raise SystemExit(f"Configuration manquante : {', '.join(manquant)}")

    chemin = next((p for p in ("mailer/serviceAccount.json", "scraper/serviceAccount.json",
                               "serviceAccount.json") if os.path.exists(p)), None)
    sa = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if sa:
        import json
        cred = credentials.Certificate(json.loads(sa))
    elif chemin:
        cred = credentials.Certificate(chemin)
    else:
        raise SystemExit("Credentials manquants.")
    firebase_admin.initialize_app(cred)
    m.db = firestore.client()

    cibles = destinataires()
    print(f"\n{len(cibles)} candidat(s) sans CV :")
    for _, email, nom, n in cibles:
        print(f"  {email:34} {nom[:24]:24} candidatures={n}")

    if not cibles:
        return 0

    print()
    for uid, email, nom, n in cibles:
        cle = f"relance_cv_{uid}"
        if AGAIN:
            if m.DRY_RUN:
                print(f"  [dry-run] relance (forcee) -> {email}")
            else:
                relancer(email, nom, n)
        else:
            m.once(cle, relancer, email, nom, n)

    print(f"\nTermine : {m.sent_count} envoi(s), {m.failures} echec(s).")
    return 1 if m.failures else 0


if __name__ == "__main__":
    sys.exit(main())

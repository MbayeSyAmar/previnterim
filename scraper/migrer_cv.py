# -*- coding: utf-8 -*-
"""Donne aux CV deja deposes l'identifiant deterministe `<uid>_cv`.

Les regles Firestore ne savent pas interroger une collection : elles ne peuvent
lire qu'un document dont elles connaissent l'adresse. Exiger un CV avant une
candidature suppose donc que le CV vive a une adresse previsible.

Sans cette migration, les CV deposes avant le changement garderaient leur
identifiant automatique, la regle ne les verrait pas, et les candidats
concernes seraient bloques alors qu'ils ont bien fourni leur CV. C'est le genre
de regression qui se remarque seulement quand quelqu'un se plaint.

Le document d'origine est conserve et marque `migratedTo`, plutot que supprime :
en cas d'erreur, rien n'est perdu, et un deuxieme passage ne refait pas le
travail.

Usage :
    python migrer_cv.py serviceAccount.json --dry-run
    python migrer_cv.py serviceAccount.json
"""

from __future__ import annotations

import argparse
import sys

import firebase_admin
from firebase_admin import credentials, firestore


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("compte", help="chemin du serviceAccount.json")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    firebase_admin.initialize_app(credentials.Certificate(args.compte))
    db = firestore.client()

    cvs = [
        (d.id, d.to_dict())
        for d in db.collection("candidateDocuments").where(
            filter=firestore.FieldFilter("documentType", "==", "cv")
        ).stream()
    ]
    print(f"{len(cvs)} CV trouve(s)\n")

    a_faire = []
    for ident, data in cvs:
        uid = data.get("candidateId")
        if not uid:
            print(f"  IGNORE   {ident} : pas de candidateId")
            continue
        cible = f"{uid}_cv"
        if ident == cible:
            print(f"  DEJA OK  {ident}")
            continue
        if data.get("migratedTo"):
            print(f"  DEJA FAIT {ident} -> {data['migratedTo']}")
            continue
        a_faire.append((ident, cible, data))
        print(f"  A MIGRER {ident} -> {cible}  ({data.get('name', '')})")

    print(f"\n{len(a_faire)} a migrer.")
    if args.dry_run:
        print("--dry-run : rien n'a ete ecrit.")
        return 0
    if not a_faire:
        return 0

    for ident, cible, data in a_faire:
        ref = db.collection("candidateDocuments").document(cible)
        # Une cible qui existe deja est un CV plus recent : on ne l'ecrase pas.
        if ref.get().exists:
            print(f"  CONSERVE {cible} existe deja, {ident} laisse tel quel")
            continue
        lot = db.batch()
        lot.set(ref, {**{k: v for k, v in data.items() if k != "migratedTo"},
                      "migratedFrom": ident,
                      "updatedAt": firestore.SERVER_TIMESTAMP})
        lot.update(db.collection("candidateDocuments").document(ident),
                   {"migratedTo": cible})
        lot.commit()
        print(f"  migre    {ident} -> {cible}")

    print("\nTermine.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

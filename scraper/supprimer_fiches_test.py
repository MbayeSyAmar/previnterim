# -*- coding: utf-8 -*-
"""Supprime les fiches de test publiees sur le tableau d'offres.

Les identifiants sont ecrits en dur, et c'est voulu. Filtrer sur le mot « test »
attrapait deux vraies offres importees, « Testeur Fonctionnel UAT Junior », qui
doivent rester. Une liste explicite ne peut pas se tromper de cible.

Chaque mission entraine ses dependances : le document `private/terms`, que la
suppression du parent ne touche pas, et les candidatures et propositions qui la
referencent, sinon les ecrans d'administration afficheraient des lignes pointant
vers une mission disparue.

Usage :
    python supprimer-tests.py <serviceAccount.json> --dry-run
    python supprimer-tests.py <serviceAccount.json>
"""
import argparse
import sys

import firebase_admin
from firebase_admin import credentials, firestore

# Les cinq fiches de test de KIL Services, verifiees une par une.
A_SUPPRIMER = {
    "72OOT8ZtFOi5pJ9xd7Xh": "Teste Amar",
    "G6gQRTXFIfvEB2MD5ZNL": "Teste Serigne",
    "kwovvfNuLH5VsHsGC3pN": "Teste Samba",
    "4CUMg4veGRAEPqZUquA1": "Agent de nettoyage (fiche d'essai, description « Nettoyage », duree « 2 »)",
    "pkYedipRa0si9SsMiL5T": "Agent de nettoyage (fiche d'essai, duree « 5 »)",
}

# Vraies offres importees que le mot « test » attrapait a tort.
A_CONSERVER = {
    "79wK0uTQgbBdCWG5zSNX": "Testeur Fonstionnel UAT Junior (Senjob)",
    "H4f1LWqxuLo86BM8haZN": "Testeur Fonctionnel UAT Junior (Emploi Dakar)",
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("compte")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    firebase_admin.initialize_app(credentials.Certificate(args.compte))
    db = firestore.client()

    print("Conservees (vraies offres importees) :")
    for ident, libelle in A_CONSERVER.items():
        existe = db.collection("missions").document(ident).get().exists
        print(f"  {'presente' if existe else 'ABSENTE'}  {ident}  {libelle}")

    print("\nA supprimer :")
    plan = []
    for ident, libelle in A_SUPPRIMER.items():
        ref = db.collection("missions").document(ident)
        snap = ref.get()
        if not snap.exists:
            print(f"  deja absente  {ident}  {libelle}")
            continue

        titre = snap.to_dict().get("title")
        sous = [d.reference for c in ref.collections() for d in c.stream()]
        apps = [d.reference for d in db.collection("applications")
                .where(filter=firestore.FieldFilter("missionId", "==", ident)).stream()]
        props = [d.reference for d in db.collection("proposals")
                 .where(filter=firestore.FieldFilter("missionId", "==", ident)).stream()]

        print(f"  {ident}  {titre!r}")
        print(f"      {len(sous)} document(s) prive(s), {len(apps)} candidature(s), {len(props)} proposition(s)")
        plan.append((ref, sous + apps + props))

    total = sum(1 + len(dep) for _, dep in plan)
    print(f"\n{len(plan)} mission(s) et {total - len(plan)} document(s) lie(s), soit {total} suppressions.")

    if args.dry_run:
        print("--dry-run : rien n'a ete supprime.")
        return 0

    if not plan:
        print("Rien a faire.")
        return 0

    lot = db.batch()
    for ref, dependances in plan:
        for d in dependances:
            lot.delete(d)
        lot.delete(ref)
    lot.commit()
    print("Supprime.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

# -*- coding: utf-8 -*-
"""Verifie que la regle bloque reellement une candidature sans CV.

Le test se fait sous l'identite d'un vrai candidat, via l'API REST, parce que le
SDK Admin contourne les regles et ne prouverait donc rien. Un compte temporaire
est cree puis supprime, avec tout ce qu'il a ecrit.

Les deux sens sont verifies : refus sans CV, acceptation avec. Un test qui ne
verifie que le refus ne distingue pas « la regle marche » de « plus personne ne
peut postuler ».
"""
import json
import sys
import time

import requests
import firebase_admin
from firebase_admin import auth, credentials, firestore

CLE_WEB = "AIzaSyCZFgj8OcZbpodJdIKgApYjxBVAab3OHP4"
PROJET = "gerart-6cdc1"
DOCS = f"https://firestore.googleapis.com/v1/projects/{PROJET}/databases/(default)/documents"

firebase_admin.initialize_app(credentials.Certificate(
    "C:/Users/Amar/Downloads/PrevInterim/scraper/serviceAccount.json"))
db = firestore.client()

email = f"essai-cv-{int(time.time())}@exemple-test.invalid"
mdp = "EssaiCv!2026"
uid = None
cree = []


def champ(v):
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, str):
        return {"stringValue": v}
    return {"nullValue": None}


def ecrire(jeton, chemin, donnees):
    r = requests.post(f"{DOCS}/{chemin}", timeout=30,
                      headers={"Authorization": f"Bearer {jeton}"},
                      json={"fields": {k: champ(v) for k, v in donnees.items()}})
    return r.status_code, r.text[:160]


try:
    user = auth.create_user(email=email, password=mdp, display_name="Essai CV")
    uid = user.uid
    print(f"compte temporaire : {uid}")

    db.collection("users").document(uid).set({
        "email": email, "displayName": "Essai CV", "role": "candidate",
        "status": "active", "createdAt": firestore.SERVER_TIMESTAMP})
    db.collection("candidateProfiles").document(uid).set({
        "name": "Essai CV", "updatedAt": firestore.SERVER_TIMESTAMP})
    cree += [("users", uid), ("candidateProfiles", uid)]

    r = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={CLE_WEB}",
        json={"email": email, "password": mdp, "returnSecureToken": True}, timeout=30)
    r.raise_for_status()
    jeton = r.json()["idToken"]
    print("connecte sous l'identite du candidat\n")

    candidature = {"candidateId": uid, "candidateName": "Essai CV", "missionId": "pvi-cariste-diamniadio",
                   "missionTitle": "Cariste", "city": "Diamniadio",
                   "companyId": "previnterim", "status": "pending", "internalNotes": ""}

    print("1. candidature SANS CV")
    code, texte = ecrire(jeton, "applications", candidature)
    sans = code == 403
    print(f"   HTTP {code}  ->  {'ok, refusee comme prevu' if sans else 'PROBLEME : acceptee'}")
    if not sans:
        print(f"   {texte}")

    print("\n2. depot du CV a l'identifiant deterministe")
    code, texte = ecrire(jeton, f"candidateDocuments?documentId={uid}_cv", {
        "candidateId": uid, "uploadedBy": uid, "documentType": "cv",
        "name": "cv-essai.pdf", "cloudinaryUrl": "https://res.cloudinary.com/essai/cv.pdf"})
    depot = code == 200
    print(f"   HTTP {code}  ->  {'ok, depot autorise' if depot else 'PROBLEME : depot refuse'}")
    if not depot:
        print(f"   {texte}")
    else:
        cree.append(("candidateDocuments", f"{uid}_cv"))

    print("\n3. candidature AVEC CV")
    code, texte = ecrire(jeton, "applications", candidature)
    avec = code == 200
    print(f"   HTTP {code}  ->  {'ok, acceptee' if avec else 'PROBLEME : toujours refusee'}")
    if not avec:
        print(f"   {texte}")
    else:
        for d in db.collection("applications").where(
                filter=firestore.FieldFilter("candidateId", "==", uid)).stream():
            cree.append(("applications", d.id))

    print("\n4. tentative de deposer un CV au nom de quelqu'un d'autre")
    code, _ = ecrire(jeton, "candidateDocuments?documentId=autre_cv", {
        "candidateId": "autre", "uploadedBy": uid, "documentType": "cv", "name": "x"})
    usurp = code == 403
    print(f"   HTTP {code}  ->  {'ok, refusee' if usurp else 'PROBLEME : acceptee'}")

    print("\n" + ("Les quatre verifications passent." if (sans and depot and avec and usurp)
                  else "AU MOINS UNE VERIFICATION ECHOUE."))

finally:
    print("\nnettoyage :")
    for col, ident in cree:
        db.collection(col).document(ident).delete()
        print(f"  supprime {col}/{ident}")
    if uid:
        auth.delete_user(uid)
        print(f"  supprime le compte {uid}")

"""Envoi des e-mails transactionnels Brevo, exécuté par GitHub Actions toutes les 5 minutes.

Le projet Firebase est sur le plan gratuit (pas de Cloud Functions) : ce script lit
les changements survenus dans Firestore depuis son dernier passage et envoie
les e-mails correspondants. La clé Brevo reste un secret GitHub, jamais exposée
au navigateur, et le contenu des e-mails est construit ici à partir de Firestore.

Variables d'environnement :
  FIREBASE_SERVICE_ACCOUNT  JSON du compte de service (secret GitHub)
  BREVO_API_KEY             clé API Brevo xkeysib-... (secret GitHub)
  MAIL_SENDER_EMAIL, MAIL_SENDER_NAME, ADMIN_EMAIL (liste séparée par des virgules), APP_URL
Option : --dry-run affiche les e-mails sans les envoyer ni rien écrire.
"""
import html
import json
import os
import sys
from datetime import datetime, timedelta, timezone

import requests
import firebase_admin
from firebase_admin import auth, credentials, firestore
from google.api_core.exceptions import AlreadyExists
from google.cloud.firestore_v1.base_query import FieldFilter

BREVO_URL = "https://api.brevo.com/v3/smtp/email"
DAKAR = timezone(timedelta(0), "GMT")  # Dakar : UTC+0 toute l'année, sans heure d'été
OVERLAP = timedelta(minutes=3)  # recouvrement entre deux passages ; le journal évite les doublons

DRY_RUN = "--dry-run" in sys.argv
SENDER_EMAIL = os.environ.get("MAIL_SENDER_EMAIL", "")
SENDER_NAME = os.environ.get("MAIL_SENDER_NAME", "Interim")
ADMIN_EMAILS = [e.strip() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()]
APP_URL = os.environ.get("APP_URL", "")

APPLICATION_STATUS = {"pending": "En attente", "reviewing": "En cours d'examen", "interview": "Entretien prévu",
                      "presented": "Présentée au client", "accepted": "Acceptée", "rejected": "Non retenue"}
MISSION_STATUS = {"pending": "En attente de validation", "published": "Publiée", "suspended": "Suspendue", "closed": "Clôturée"}
TOPICS = {"candidate": "Candidat", "company": "Entreprise", "other": "Autre"}

esc = html.escape
db = None
sent_count = 0
failures = 0


# ── Rendu ──────────────────────────────────────────────────────────────────────

def fr_date(value=None) -> str:
    months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
              "septembre", "octobre", "novembre", "décembre"]
    d = (value or datetime.now(timezone.utc)).astimezone(DAKAR)
    return f"{d.day} {months[d.month - 1]} {d.year}"


def fr_datetime(value: str) -> str:
    try:
        d = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return value or ""
    return f"{fr_date(d.replace(tzinfo=DAKAR))} à {d:%H:%M}"


def layout(title, intro, rows=(), cta=None) -> str:
    rows_html = "".join(
        f'<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e7e4;background:#f5f7f5;color:#5c6863;font-size:13px;width:38%;vertical-align:top">{esc(k)}</td>'
        f'<td style="padding:10px 14px;border-bottom:1px solid #e2e7e4;color:#1b2521;font-size:14px;white-space:pre-line">{esc(str(v or "Non renseigné"))}</td></tr>'
        for k, v in rows
    )
    table = (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;border:1px solid #e2e7e4">{rows_html}</table>'
             if rows else "")
    button = (f'<p style="margin:24px 0 0"><a href="{esc(cta[1] or APP_URL)}" style="display:inline-block;background:#1f6b52;color:#ffffff;text-decoration:none;'
              f'padding:12px 20px;border-radius:6px;font-weight:600;font-size:14px">{esc(cta[0])}</a></p>' if cta else "")
    site = f'<a href="{esc(APP_URL)}" style="color:#1f6b52">{esc(APP_URL.split("//")[-1])}</a>' if APP_URL else ""
    return f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>{esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f7f5;font-family:Arial,Helvetica,sans-serif;color:#1b2521">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e7e4">
<tr><td style="background:#123d30;padding:18px 28px;color:#ffffff;font-size:20px;font-weight:700">{esc(SENDER_NAME)}</td></tr>
<tr><td style="padding:28px"><h1 style="margin:0 0 12px;font-size:20px;color:#123d30">{esc(title)}</h1>
<p style="margin:0;font-size:15px;line-height:1.6">{intro}</p>{table}{button}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e2e7e4;color:#5c6863;font-size:12px;line-height:1.5">Cet e-mail est envoyé automatiquement par la plateforme {esc(SENDER_NAME)}. {site}</td></tr>
</table></td></tr></table></body></html>"""


def plain(title, intro, rows=()) -> str:
    text = html.unescape(intro.replace("<br>", "\n").replace("<strong>", "").replace("</strong>", ""))
    return "\n".join([title, "", text, ""] + [f"{k} : {v or 'Non renseigné'}" for k, v in rows])


# ── Envoi ──────────────────────────────────────────────────────────────────────

def send(to, subject, title, intro, rows=(), cta=None, reply_to=None, to_name=None, tag=None):
    global sent_count
    recipients = [e for e in ([to] if isinstance(to, str) else to) if e]
    if not recipients:
        return
    if DRY_RUN:
        print(f"  [dry-run] {subject}  ->  {', '.join(recipients)}")
        return
    payload = {
        "sender": {"email": SENDER_EMAIL, "name": SENDER_NAME},
        "to": [{"email": e, **({"name": to_name} if to_name and len(recipients) == 1 else {})} for e in recipients],
        "subject": subject,
        "htmlContent": layout(title, intro, rows, cta),
        "textContent": plain(title, intro, rows),
    }
    if reply_to:
        payload["replyTo"] = reply_to
    if tag:
        payload["tags"] = [tag]
    r = requests.post(BREVO_URL, json=payload, timeout=20,
                      headers={"api-key": os.environ["BREVO_API_KEY"], "accept": "application/json"})
    if r.status_code >= 300:
        raise RuntimeError(f"Brevo {r.status_code} : {r.text[:300]}")
    sent_count += 1
    print(f"  envoyé : {subject}  ->  {', '.join(recipients)}")


def send_admin(subject, title, intro, rows=(), cta=None, reply_to=None, tag=None):
    send(ADMIN_EMAILS, subject, title, intro, rows, cta, reply_to, tag=tag)


# ── Journal (idempotence) ─────────────────────────────────────────────────────

def log_ref(key):
    return db.collection("serverOnlyMailLog").document(key)


def once(key, handler, *args):
    """Exécute handler une seule fois par clé. Le journal n'est écrit qu'après
    un envoi réussi : en cas d'échec, le prochain passage réessaie."""
    if log_ref(key).get().exists:
        return
    try:
        handler(*args)
    except Exception as e:  # un e-mail en échec ne doit pas bloquer les autres
        global failures
        failures += 1
        print(f"  ERREUR {key} : {e}")
        return
    if not DRY_RUN:
        try:
            log_ref(key).create({"at": firestore.SERVER_TIMESTAMP})
        except AlreadyExists:
            pass


def track_status(kind, doc_id, status, handler=None, *args):
    """Suit le statut d'un document. Si le statut a changé depuis le dernier
    enregistré, appelle handler ; le nouveau statut n'est enregistré qu'après
    un envoi réussi, pour qu'un échec soit réessayé au passage suivant.
    Un document sans historique (créé depuis le premier passage) est
    simplement enregistré, sans notification."""
    global failures
    ref = log_ref(f"status_{kind}_{doc_id}")
    snap = ref.get()
    previous = snap.to_dict().get("status") if snap.exists else None
    if previous == status:
        return
    if previous is not None and handler:
        try:
            handler(*args)
        except Exception as e:
            failures += 1
            print(f"  ERREUR status_{kind}_{doc_id} : {e}")
            return
    if not DRY_RUN:
        ref.set({"status": status, "at": firestore.SERVER_TIMESTAMP})


# ── Lecture Firestore ──────────────────────────────────────────────────────────

def get(path):
    snap = db.document(path).get()
    return snap.to_dict() if snap.exists else {}


def contact_of(uid):
    user = get(f"users/{uid}")
    email, name, provider = user.get("email"), user.get("displayName", ""), "E-mail et mot de passe"
    try:
        record = auth.get_user(uid)
        email = email or record.email
        name = name or record.display_name or ""
        if any(p.provider_id == "google.com" for p in record.provider_data):
            provider = "Google"
    except Exception:
        pass
    return email, name, provider


def changed_since(collection, field, since):
    return list(db.collection(collection).where(filter=FieldFilter(field, ">", since)).stream())


def is_scraped(doc_id, data):
    return doc_id.startswith("scraped_") or bool(data.get("source"))


# ── Événements ─────────────────────────────────────────────────────────────────

def on_registered(uid, user):
    email, _, provider = contact_of(uid)
    if user.get("role") == "candidate":
        p = get(f"candidateProfiles/{uid}")
        send(email, "Votre compte candidat est créé",
             f"Bienvenue {p.get('name', '')}".strip(),
             "Votre compte candidat est actif. Pour que notre équipe puisse vous proposer des missions, complétez votre profil "
             "(compétences, expérience, disponibilités) et déposez votre CV.",
             cta=("Compléter mon profil", APP_URL), to_name=p.get("name"), tag="inscription-candidat")
        send_admin(f"Nouvelle inscription candidat : {p.get('name') or email}", "Nouvelle inscription candidat",
                   "Un candidat vient de créer son compte.",
                   [("Nom", p.get("name")), ("E-mail", email), ("Téléphone", p.get("phone")), ("Ville", p.get("city")),
                    ("Connexion", provider), ("Date", fr_date())],
                   reply_to={"email": email} if email else None, tag="admin-inscription")
    elif user.get("role") == "company":
        c = get(f"companies/{uid}")
        rows = [("Entreprise", c.get("companyName")), ("Contact", c.get("contactName")), ("Téléphone", c.get("phone")), ("Ville", c.get("city"))]
        send(email, "Votre demande d'inscription entreprise est enregistrée", "Demande enregistrée",
             f"Bonjour {esc(c.get('contactName', ''))},<br><br>Nous avons bien reçu l'inscription de <strong>{esc(c.get('companyName', ''))}</strong>. "
             "Notre équipe vérifie les informations de l'entreprise, généralement sous 48 heures ouvrées. Vous recevrez un e-mail "
             "dès que le compte sera validé ; vous pourrez alors publier vos missions.",
             rows, to_name=c.get("contactName"), tag="inscription-entreprise")
        send_admin(f"Entreprise à valider : {c.get('companyName')}", "Nouvelle entreprise à valider",
                   "Une entreprise vient de s'inscrire. Son compte reste en attente jusqu'à votre validation.",
                   rows + [("E-mail", email), ("SIRET / NINEA", c.get("siret")), ("Connexion", provider), ("Date", fr_date())],
                   cta=("Ouvrir le tableau de bord", APP_URL), reply_to={"email": email} if email else None, tag="admin-inscription")


def on_application_created(app_id, a):
    email, _, _ = contact_of(a["candidateId"])
    p = get(f"candidateProfiles/{a['candidateId']}")
    track_status("applications", app_id, a.get("status", "pending"))  # point de départ du suivi de statut
    send(email, f"Candidature enregistrée : {a.get('missionTitle')}", "Votre candidature est enregistrée",
         "Notre équipe étudie votre dossier. Vous serez prévenu par e-mail à chaque étape (examen, entretien, réponse de l'entreprise).",
         [("Poste", a.get("missionTitle")), ("Lieu", a.get("city")), ("Date", fr_date())],
         cta=("Suivre mes candidatures", APP_URL), to_name=a.get("candidateName"), tag="candidature")
    send_admin(f"Nouvelle candidature : {a.get('missionTitle')}", "Nouvelle candidature", "Un candidat vient de postuler.",
               [("Candidat", a.get("candidateName")), ("E-mail", email), ("Téléphone", p.get("phone")), ("Ville du candidat", p.get("city")),
                ("Poste", a.get("missionTitle")), ("Lieu du poste", a.get("city")), ("Compétences", ", ".join(p.get("skills") or [])),
                ("Date", fr_date())],
               cta=("Traiter la candidature", APP_URL), reply_to={"email": email} if email else None, tag="admin-candidature")


def on_application_status(a):
    email, _, _ = contact_of(a["candidateId"])
    label = APPLICATION_STATUS.get(a["status"], a["status"])
    send(email, f"Votre candidature : {label}", "Votre candidature a évolué",
         f"Le statut de votre candidature pour <strong>{esc(a.get('missionTitle', ''))}</strong> est maintenant : <strong>{esc(label)}</strong>.",
         cta=("Voir le détail", APP_URL), to_name=a.get("candidateName"), tag="candidature-statut")


def on_interview(i):
    email, _, _ = contact_of(i["candidateId"])
    send(email, f"Entretien planifié : {i.get('missionTitle')}", "Un entretien est planifié",
         "Notre équipe souhaite échanger avec vous au sujet de votre candidature.",
         [("Poste", i.get("missionTitle")), ("Date et heure", fr_datetime(i.get("scheduledAt")))],
         cta=("Ouvrir mon espace", APP_URL), to_name=i.get("candidateName"), tag="entretien")


def on_mission_submitted(mission_id, m):
    email, _, _ = contact_of(m["companyId"])
    track_status("missions", mission_id, m.get("status", "pending"))
    pay = get(f"missions/{mission_id}/private/terms").get("pay", "")
    rows = [("Poste", m.get("title")), ("Secteur", m.get("sector")), ("Lieu", m.get("city")), ("Contrat", m.get("contractType")),
            ("Durée", m.get("duration")), ("Rémunération", pay)]
    send(email, f"Mission reçue : {m.get('title')}", "Votre mission est enregistrée",
         "Elle sera publiée après une vérification rapide par notre équipe. Vous serez prévenu par e-mail.",
         rows, to_name=m.get("companyName"), tag="mission")
    send_admin(f"Mission à valider : {m.get('title')} ({m.get('companyName')})", "Nouvelle mission à valider",
               f"<strong>{esc(m.get('companyName', ''))}</strong> a soumis une mission.",
               [("Entreprise", m.get("companyName")), ("E-mail", email)] + rows + [("Description", m.get("description"))],
               cta=("Valider la mission", APP_URL), reply_to={"email": email} if email else None, tag="admin-mission")


def on_mission_status(m):
    email, _, _ = contact_of(m["companyId"])
    label = MISSION_STATUS.get(m["status"], m["status"])
    send(email, f"Votre mission {m.get('title')} : {label}", "Statut de votre mission",
         f"La mission <strong>{esc(m.get('title', ''))}</strong> est maintenant : <strong>{esc(label)}</strong>.",
         cta=("Voir mes missions", APP_URL), to_name=m.get("companyName"), tag="mission-statut")


def on_company_status(uid, c):
    email, _, _ = contact_of(uid)
    approved = c["status"] == "active"
    send(email, "Votre compte entreprise est validé" if approved else "Votre demande de compte entreprise",
         "Compte validé" if approved else "Demande non validée",
         f"Le compte de <strong>{esc(c.get('companyName', ''))}</strong> est validé. Vous pouvez dès maintenant publier vos missions."
         if approved else
         f"Nous n'avons pas pu valider le compte de <strong>{esc(c.get('companyName', ''))}</strong>. Répondez à cet e-mail "
         "ou utilisez le formulaire de contact si vous pensez qu'il s'agit d'une erreur.",
         cta=("Publier une mission", APP_URL) if approved else None, to_name=c.get("contactName"), tag="entreprise-statut")


def on_contact(msg):
    send(msg["email"], "Nous avons bien reçu votre message", "Message reçu",
         f"Bonjour {esc(msg.get('name', ''))},<br><br>Merci pour votre message. Notre équipe vous répond sous 2 jours ouvrés. "
         "Voici une copie de votre demande.",
         [("Objet", msg.get("subject")), ("Message", msg.get("message"))], to_name=msg.get("name"), tag="contact")
    send_admin(f"Contact : {msg.get('subject')}", "Nouveau message de contact",
               "Répondez directement à cet e-mail pour écrire à l'expéditeur.",
               [("Nom", msg.get("name")), ("E-mail", msg.get("email")), ("Téléphone", msg.get("phone")),
                ("Profil", TOPICS.get(msg.get("topic"), msg.get("topic"))), ("Objet", msg.get("subject")),
                ("Message", msg.get("message")), ("Date", fr_date())],
               reply_to={"email": msg["email"], "name": msg.get("name") or msg["email"]}, tag="admin-contact")


# ── Passage ────────────────────────────────────────────────────────────────────

def bootstrap(now):
    """Premier passage : mémorise les statuts actuels, sans rien envoyer pour l'historique."""
    print("Premier passage : enregistrement des statuts actuels (aucun e-mail envoyé pour l'historique).")
    batch, n = db.batch(), 0
    for kind in ("applications", "missions", "companies"):
        for doc in db.collection(kind).stream():
            data = doc.to_dict()
            if kind != "applications" and is_scraped(doc.id, data):
                continue
            batch.set(log_ref(f"status_{kind}_{doc.id}"), {"status": data.get("status"), "at": firestore.SERVER_TIMESTAMP})
            n += 1
            if n % 450 == 0:
                batch.commit()
                batch = db.batch()
    batch.commit()
    db.document("serverOnly/mailer").set({"lastRun": now})
    print(f"{n} statuts enregistrés.")


def run():
    now = datetime.now(timezone.utc)
    state_ref = db.document("serverOnly/mailer")
    state = state_ref.get()
    if not state.exists:
        if not DRY_RUN:
            bootstrap(now)
        else:
            print("[dry-run] premier passage : l'initialisation serait effectuée, rien d'autre.")
        return
    since = state.to_dict()["lastRun"] - OVERLAP
    print(f"Changements depuis {since.astimezone(DAKAR):%d/%m %H:%M} (heure de Dakar)")

    for doc in changed_since("users", "createdAt", since):
        once(f"register_{doc.id}", on_registered, doc.id, doc.to_dict())

    for doc in changed_since("applications", "createdAt", since):
        once(f"application_{doc.id}", on_application_created, doc.id, doc.to_dict())
    for doc in changed_since("applications", "updatedAt", since):
        a = doc.to_dict()
        track_status("applications", doc.id, a.get("status"), on_application_status if a.get("status") != "pending" else None, a)

    for doc in changed_since("interviews", "createdAt", since):
        once(f"interview_{doc.id}", on_interview, doc.to_dict())

    for doc in changed_since("missions", "createdAt", since):
        m = doc.to_dict()
        if not is_scraped(m.get("companyId", ""), m) and m.get("status") == "pending":
            once(f"mission_{doc.id}", on_mission_submitted, doc.id, m)
    for doc in changed_since("missions", "updatedAt", since):
        m = doc.to_dict()
        if not is_scraped(m.get("companyId", ""), m):
            track_status("missions", doc.id, m.get("status"), on_mission_status, m)

    for doc in changed_since("companies", "updatedAt", since):
        c = doc.to_dict()
        if not is_scraped(doc.id, c):
            notify = on_company_status if c.get("status") in ("active", "rejected") else None
            track_status("companies", doc.id, c.get("status"), notify, doc.id, c)

    for doc in changed_since("contactMessages", "createdAt", since):
        once(f"contact_{doc.id}", on_contact, doc.to_dict())

    # Après un échec, la fenêtre n'avance pas : le prochain passage réessaie
    # (les envois réussis sont protégés par le journal). Au-delà d'une heure,
    # on avance quand même pour ne pas rester bloqué sur une adresse invalide.
    last = state.to_dict()["lastRun"]
    if not DRY_RUN and (not failures or now - last > timedelta(hours=1)):
        state_ref.set({"lastRun": now})
    print(f"Terminé : {sent_count} e-mail(s) envoyé(s), {failures} échec(s).")


def main():
    global db
    missing = [k for k in ("BREVO_API_KEY", "MAIL_SENDER_EMAIL") if not os.environ.get(k)]
    if missing and not DRY_RUN:
        raise SystemExit(f"Configuration manquante : {', '.join(missing)}")
    sa = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if sa:
        cred = credentials.Certificate(json.loads(sa))
    else:
        path = next((p for p in ("mailer/serviceAccount.json", "scraper/serviceAccount.json", "serviceAccount.json") if os.path.exists(p)), None)
        if not path:
            raise SystemExit("Credentials manquants : définissez FIREBASE_SERVICE_ACCOUNT.")
        cred = credentials.Certificate(path)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    run()


if __name__ == "__main__":
    main()

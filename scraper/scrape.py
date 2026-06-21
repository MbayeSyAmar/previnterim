import os
import json
import re
import time
from datetime import datetime, timedelta, timezone

import requests
from bs4 import BeautifulSoup
import firebase_admin
from firebase_admin import credentials, firestore

SCRAPE_TTL_DAYS = 5
BOT_UA = "Mozilla/5.0 (compatible; InterimSN-Bot/1.0; +https://gerart-6cdc1.web.app)"

SOURCES = [
    {"id": "seninterim",   "name": "SenInterim",      "url": "https://seninterim.sn/index.php/jobs-default/", "city": "Dakar"},
    {"id": "emploisenegal","name": "Emploi Sénégal",   "url": "https://www.emploisenegal.com/offres-emploi",   "city": "Sénégal"},
    {"id": "snjob",        "name": "SN Job",           "url": "http://www.snjob.sn/",                          "city": "Dakar"},
    {"id": "elaninterim",  "name": "Elan Interim",     "url": "https://www.elaninterim.sn/",                   "city": "Dakar"},
    {"id": "humanis",      "name": "Humanis Interim",  "url": "https://humanisinterim.sn/",                    "city": "Dakar"},
    {"id": "afriquerh",    "name": "Afrique RH",       "url": "https://www.afriquerh.sn/",                     "city": "Dakar"},
]

SECTORS = {
    "BTP / Construction":        ["btp", "construct", "bâtiment", "génie civil", "travaux"],
    "Industrie / Production":    ["industri", "product", "manufactur", "usine", "atelier"],
    "Transport / Logistique":    ["transport", "logistiq", "chauffeur", "livraison", "supply chain"],
    "Commerce / Vente":          ["commerc", "vente", "vendeur", "retail", "boutique"],
    "Informatique / Tech":       ["informatiq", "développeur", "developer", "tech", "digital", "web", "software"],
    "Finance / Comptabilité":    ["financ", "comptab", "audit", "banque", "fiscal"],
    "Santé / Social":            ["santé", "médic", "infirm", "social", "humanitaire", "ong"],
    "Agriculture / Élevage":     ["agricult", "élevage", "agronom", "rural", "pêche"],
    "Hôtellerie / Restauration": ["hôtel", "restaur", "cuisine", "chef", "tourisme"],
    "Administration / RH":       ["admin", " rh ", "ressources humaines", "secrétaire", "assistant"],
    "Enseignement / Formation":  ["enseign", "format", "professeur", "éducation", "école"],
}


def detect_sector(text: str) -> str:
    t = text.lower()
    for sector, keywords in SECTORS.items():
        if any(kw in t for kw in keywords):
            return sector
    return "Autre"


def fetch_html(url: str, timeout: int = 20) -> str | None:
    try:
        r = requests.get(url, headers={"User-Agent": BOT_UA, "Accept-Language": "fr-FR,fr;q=0.9"}, timeout=timeout)
        r.raise_for_status()
        return r.text
    except Exception as e:
        print(f"  [fetch] {url}: {e}")
        return None


def parse_jobs(html: str, source: dict) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    jobs = []

    # Try known CMS selectors first (Joomla K2, generic)
    for sel in [".k2Item", "article.job", ".job-listing", ".offre", ".offer",
                ".job-item", ".views-row", "li.job", "article"]:
        items = soup.select(sel)
        if len(items) >= 2:
            for item in items[:25]:
                title_el = item.find(["h1", "h2", "h3", "h4"]) or item.select_one(".title,.job-title,.poste")
                if not title_el:
                    continue
                title = title_el.get_text(" ", strip=True)
                if not title or len(title) < 5 or len(title) > 150:
                    continue
                desc_el = item.select_one("p, .description, .summary, .excerpt")
                desc = desc_el.get_text(" ", strip=True)[:400] if desc_el else ""
                city_el = item.select_one(".city,.lieu,.location,.ville")
                city = city_el.get_text(strip=True)[:60] if city_el else source["city"]
                contract_el = item.select_one(".contract,.contrat,.type")
                contract = contract_el.get_text(strip=True)[:30] if contract_el else "CDI"
                jobs.append({"title": title, "city": city or source["city"],
                             "description": desc or f"Offre disponible sur {source['name']}",
                             "contractType": contract})
            if jobs:
                return jobs

    # Fallback: harvest meaningful anchor texts
    for a in soup.find_all("a", href=True):
        text = a.get_text(" ", strip=True)
        if 15 < len(text) < 120 and not re.search(r"(accueil|menu|contact|login|connexion|inscription)", text, re.I):
            jobs.append({"title": text, "city": source["city"],
                         "description": f"Offre disponible sur {source['name']}", "contractType": "CDI"})
        if len(jobs) >= 15:
            break

    return jobs


def ensure_company(db, source: dict):
    ref = db.collection("companies").document(f"scraped_{source['id']}")
    if not ref.get().exists:
        ref.set({
            "companyName": source["name"],
            "city": source["city"],
            "status": "active",
            "source": "scraped",
            "sourceUrl": source["url"],
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })
        print(f"  Entreprise créée : scraped_{source['id']}")


def scrape_source(db, source: dict) -> int:
    print(f"\n[{source['name']}] {source['url']}")
    html = fetch_html(source["url"])
    if not html:
        return 0

    jobs = parse_jobs(html, source)
    if not jobs:
        print("  Aucune offre trouvée.")
        return 0

    ensure_company(db, source)

    existing_titles = {
        doc.to_dict().get("title", "").lower()
        for doc in db.collection("missions").where("source", "==", source["id"]).stream()
    }

    added = 0
    for job in jobs:
        if job["title"].lower() in existing_titles:
            continue
        db.collection("missions").add({
            **job,
            "duration": "Non précisé",
            "pay": "Selon profil (FCFA)",
            "sector": detect_sector(job["title"] + " " + job["description"]),
            "companyId": f"scraped_{source['id']}",
            "companyName": source["name"],
            "status": "published",
            "source": source["id"],
            "sourceUrl": source["url"],
            "scrapedAt": firestore.SERVER_TIMESTAMP,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })
        existing_titles.add(job["title"].lower())
        added += 1

    print(f"  +{added} offres ajoutées")
    return added


def clean_old_jobs(db) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=SCRAPE_TTL_DAYS)
    docs = list(db.collection("missions").where("scrapedAt", "<", cutoff).stream())
    batch = db.batch()
    for i, doc in enumerate(docs):
        batch.delete(doc.reference)
        if (i + 1) % 499 == 0:
            batch.commit()
            batch = db.batch()
    if docs:
        batch.commit()
    print(f"\nSupprimées : {len(docs)} offres > {SCRAPE_TTL_DAYS} jours")
    return len(docs)


def main():
    # Charge les credentials depuis la variable d'environnement (GitHub Actions)
    # ou depuis un fichier local serviceAccount.json
    sa_env = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if sa_env:
        cred = credentials.Certificate(json.loads(sa_env))
    elif os.path.exists("scraper/serviceAccount.json"):
        cred = credentials.Certificate("scraper/serviceAccount.json")
    else:
        raise FileNotFoundError(
            "Credentials manquants. Posez serviceAccount.json dans scraper/ ou "
            "définissez la variable d'environnement FIREBASE_SERVICE_ACCOUNT."
        )

    firebase_admin.initialize_app(cred)
    db = firestore.client()

    total = 0
    for source in SOURCES:
        try:
            total += scrape_source(db, source)
        except Exception as e:
            print(f"  ERREUR [{source['name']}]: {e}")
        time.sleep(2)

    deleted = clean_old_jobs(db)
    print(f"\n=== Scraping terminé : +{total} ajoutées, {deleted} supprimées ===")


if __name__ == "__main__":
    main()

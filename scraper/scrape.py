import os
import json
import re
import time
from datetime import datetime, timedelta, timezone

import requests
from bs4 import BeautifulSoup
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter

SCRAPE_TTL_DAYS = 5

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}

# Sources vérifiées comme accessibles
SOURCES = [
    {
        "id": "seninterim",
        "name": "SenInterim",
        "urls": ["https://seninterim.sn/index.php/jobs-default/"],
        "city": "Dakar",
    },
    {
        "id": "emploisenegal",
        "name": "Emploi Sénégal",
        "urls": ["https://www.emploisenegal.com/recherche-jobs-senegal"],
        "city": "Sénégal",
        # Le site expose ses données dans window.__INITIAL_STATE__ ou __NEXT_DATA__
        "json_extract": True,
    },
    {
        "id": "rekrute",
        "name": "Rekrute Sénégal",
        "urls": [
            "https://www.rekrute.com/offres-emploi-senegal.html",
            "https://www.rekrute.com/offres.html?s=3&p=1&i=1&pays=221",
        ],
        "city": "Sénégal",
    },
    {
        "id": "optioncarriere",
        "name": "Option Carrière",
        "urls": ["https://www.optioncarriere.sn/emploi.php"],
        "city": "Sénégal",
    },
    {
        "id": "expatsn",
        "name": "Expat.com Sénégal",
        "urls": ["https://www.expat.com/en/jobs/africa/senegal/"],
        "city": "Dakar",
    },
]

SECTORS = {
    "BTP / Construction":        ["btp", "construct", "bâtiment", "génie civil", "travaux"],
    "Industrie / Production":    ["industri", "product", "manufactur", "usine", "atelier"],
    "Transport / Logistique":    ["transport", "logistiq", "chauffeur", "livraison", "supply"],
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


def fetch_html(urls: list[str], timeout: int = 20) -> tuple[str | None, str | None]:
    for url in urls:
        try:
            r = requests.get(url, headers=HEADERS, timeout=timeout, allow_redirects=True)
            r.raise_for_status()
            print(f"  OK  {url}  ({len(r.text)} chars)")
            return r.text, url
        except Exception as e:
            short = str(e)[:80]
            print(f"  KO  {url}  →  {short}")
    return None, None


def extract_from_json_scripts(soup: BeautifulSoup) -> list[dict]:
    """Extrait les offres depuis les balises <script> des SPAs (Next.js, Nuxt, etc.)."""
    jobs = []
    for script in soup.find_all("script"):
        text = script.string or ""
        if not text or len(text) < 100:
            continue

        # Cherche les patterns courants de données embarquées
        candidates = []

        # Next.js __NEXT_DATA__
        m = re.search(r"__NEXT_DATA__\s*=\s*(\{.+?\});?\s*</", text + "</", re.S)
        if m:
            candidates.append(m.group(1))

        # window.__INITIAL_STATE__ ou window.__STATE__
        m = re.search(r"window\.__(?:INITIAL_STATE|STATE|DATA)__\s*=\s*(\{.+?\});", text, re.S)
        if m:
            candidates.append(m.group(1))

        # JSON brut dans le script
        if text.strip().startswith("{") or text.strip().startswith("["):
            candidates.append(text.strip())

        for raw in candidates:
            try:
                data = json.loads(raw)
                found = _dig_jobs_from_json(data)
                jobs.extend(found)
                if found:
                    break
            except Exception:
                pass

        if jobs:
            break

    return jobs[:25]


def _dig_jobs_from_json(obj, depth: int = 0) -> list[dict]:
    """Parcourt récursivement un objet JSON pour trouver des offres d'emploi."""
    if depth > 6:
        return []
    jobs = []
    if isinstance(obj, list):
        for item in obj[:30]:
            if isinstance(item, dict):
                title = (item.get("title") or item.get("titre") or item.get("intitule")
                         or item.get("name") or item.get("poste") or "")
                if title and 5 < len(str(title)) < 150:
                    jobs.append({
                        "title": str(title),
                        "city": str(item.get("city") or item.get("ville") or item.get("lieu") or ""),
                        "description": str(item.get("description") or item.get("resume") or "")[:400],
                        "contractType": str(item.get("contract") or item.get("contrat") or item.get("type") or "CDI"),
                    })
            if len(jobs) >= 20:
                break
        if jobs:
            return jobs
        for item in obj[:10]:
            jobs.extend(_dig_jobs_from_json(item, depth + 1))
            if jobs:
                return jobs
    elif isinstance(obj, dict):
        for v in obj.values():
            if isinstance(v, (list, dict)):
                jobs.extend(_dig_jobs_from_json(v, depth + 1))
                if jobs:
                    return jobs
    return jobs


def parse_jobs(html: str, source: dict, source_url: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")

    # 1. Essai extraction JSON (SPAs)
    if source.get("json_extract"):
        jobs = extract_from_json_scripts(soup)
        if jobs:
            print(f"  {len(jobs)} offres trouvées via JSON embarqué")
            return jobs

    # 2. Sélecteurs CSS courants
    for sel in [
        ".k2Item", "article.job", ".job-listing", ".job_listing",
        ".offre-emploi", ".offre", ".offer", ".job-item",
        ".views-row", "li.job", ".poste", "article",
    ]:
        items = soup.select(sel)
        if len(items) < 2:
            continue
        jobs = []
        for item in items[:25]:
            title_el = (
                item.find(["h1", "h2", "h3", "h4"])
                or item.select_one(".title,.job-title,.poste,.intitule")
            )
            if not title_el:
                continue
            title = title_el.get_text(" ", strip=True)
            if not title or len(title) < 5 or len(title) > 150:
                continue
            desc_el = item.select_one("p,.description,.summary,.excerpt,.details")
            desc = desc_el.get_text(" ", strip=True)[:400] if desc_el else ""
            city_el = item.select_one(".city,.lieu,.location,.ville,.localisation")
            city = (city_el.get_text(strip=True)[:60] if city_el else "") or source["city"]
            contract_el = item.select_one(".contract,.contrat,.type-contrat,.type")
            contract = contract_el.get_text(strip=True)[:30] if contract_el else "CDI"
            jobs.append({
                "title": title,
                "city": city,
                "description": desc or f"Offre disponible sur {source['name']}",
                "contractType": contract,
            })
        if jobs:
            print(f"  {len(jobs)} offres trouvées via sélecteur '{sel}'")
            return jobs

    # 3. Essai JSON même sans flag (certains sites l'embarquent toujours)
    jobs = extract_from_json_scripts(soup)
    if jobs:
        print(f"  {len(jobs)} offres trouvées via JSON embarqué (fallback)")
        return jobs

    # 4. Dernier recours : liens textuels significatifs
    skip = re.compile(
        r"accueil|menu|contact|login|connexion|inscription|facebook|twitter|linkedin|newsletter|cookie",
        re.I
    )
    jobs = []
    for a in soup.find_all("a", href=True):
        text = a.get_text(" ", strip=True)
        if 15 < len(text) < 120 and not skip.search(text):
            jobs.append({
                "title": text,
                "city": source["city"],
                "description": f"Voir l'offre sur {source['name']} : {source_url}",
                "contractType": "CDI",
            })
        if len(jobs) >= 15:
            break

    if jobs:
        print(f"  {len(jobs)} offres trouvées via liens textuels")
    return jobs


def ensure_company(db, source: dict, source_url: str):
    ref = db.collection("companies").document(f"scraped_{source['id']}")
    if not ref.get().exists:
        ref.set({
            "companyName": source["name"],
            "city": source["city"],
            "status": "active",
            "source": "scraped",
            "sourceUrl": source_url,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })
        print(f"  Entreprise créée : scraped_{source['id']}")


def scrape_source(db, source: dict) -> int:
    print(f"\n[{source['name']}]")
    html, used_url = fetch_html(source["urls"])
    if not html:
        return 0

    jobs = parse_jobs(html, source, used_url)
    if not jobs:
        print("  Aucune offre trouvée.")
        return 0

    ensure_company(db, source, used_url)

    existing_titles = {
        doc.to_dict().get("title", "").lower()
        for doc in db.collection("missions")
        .where(filter=FieldFilter("source", "==", source["id"]))
        .stream()
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
            "sourceUrl": used_url,
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
    docs = list(
        db.collection("missions")
        .where(filter=FieldFilter("scrapedAt", "<", cutoff))
        .stream()
    )
    batch = db.batch()
    for i, doc in enumerate(docs):
        batch.delete(doc.reference)
        if (i + 1) % 499 == 0:
            batch.commit()
            batch = db.batch()
    if docs:
        batch.commit()
    print(f"\nSupprimées : {len(docs)} offres de plus de {SCRAPE_TTL_DAYS} jours")
    return len(docs)


def main():
    sa_env = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if sa_env:
        cred = credentials.Certificate(json.loads(sa_env))
    elif os.path.exists("scraper/serviceAccount.json"):
        cred = credentials.Certificate("scraper/serviceAccount.json")
    elif os.path.exists("serviceAccount.json"):
        cred = credentials.Certificate("serviceAccount.json")
    else:
        raise FileNotFoundError(
            "Credentials manquants : placez serviceAccount.json dans scraper/ "
            "ou définissez FIREBASE_SERVICE_ACCOUNT."
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

import os
import sys
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
        "id": "senjob",
        "name": "Senjob",
        "urls": ["https://senjob.com/sn/offres-d-emploi.php"],
        "city": "Sénégal",
        "parser": "senjob",
    },
    {
        "id": "offreemploisn",
        "name": "Offre-Emploi.sn",
        "urls": ["https://offre-emploi.sn/offres-emploi", "https://offre-emploi.sn/"],
        "city": "Dakar",
        "parser": "offreemploi",
    },
    {
        "id": "wiijob",
        "name": "Wiijob",
        "urls": ["https://wiijob.com/offres-emploi-localisation/senegal/"],
        "city": "Sénégal",
    },
    # Sites WP Job Manager : les offres sont chargées en JS, on interroge
    # directement leur endpoint AJAX plutôt que la page statique (vide).
    {
        "id": "emploidakar",
        "name": "Emploi Dakar",
        "urls": ["https://www.emploidakar.com/offres-demploi-au-senegal/"],
        "wp_ajax": "https://www.emploidakar.com/wp-admin/admin-ajax.php",
        "city": "Dakar",
    },
    {
        "id": "humanis",
        "name": "Humanis Intérim",
        "urls": ["https://humanis-sn.com/offres-demplois/"],
        "wp_ajax": "https://humanis-sn.com/wp-admin/admin-ajax.php",
        "city": "Dakar",
    },
    {
        "id": "umointerim",
        "name": "UMO Intérim",
        "urls": ["https://www.umo-interim.com/offres/"],
        "wp_ajax": "https://www.umo-interim.com/wp-admin/admin-ajax.php",
        "city": "Dakar",
        # Ce cabinet publie pour plusieurs pays d'Afrique de l'Ouest sur la même page.
        "senegal_only": True,
    },
]

# Sources retirées : leurs missions déjà en base sont supprimées au prochain passage.
# Expat.com : la page "jobs" ne contient que des sujets de forum, aucune offre.
REMOVED_SOURCES = ["expatsn"]

NON_SENEGAL_HINTS = [
    "bénin", "benin", "côte d'ivoire", "cote d'ivoire", "burkina", "mali",
    "niger", "togo", "guinée", "guinee", "cameroun", "gabon", "congo",
    "tchad", "maroc", "algérie", "algerie", "tunisie", "nigeria", "ghana",
]


def is_senegal_job(job: dict) -> bool:
    text = f"{job.get('city', '')} {job.get('title', '')}".lower()
    return not any(hint in text for hint in NON_SENEGAL_HINTS)


# Textes de navigation, de catégories ou de contenu éditorial qui ne sont pas des offres.
NOT_A_JOB = re.compile(
    r"aller au contenu|publier une offre|d[ée]poser (une|votre) offre|tous les secteurs|toutes les offres"
    r"|voir (plus|tout|toutes|l'offre)|en savoir plus|lire la suite|page suivante|accueil|connexion"
    r"|inscription|mot de passe|newsletter|cookie|politique de|mentions l[ée]gales|contactez"
    r"|jobs default|forum|guide|visa|directory|annuaire|living in|business (ideas|opportunit)"
    r"|^formation\b|^mod[èe]les? de cv",
    re.I,
)
NAV_SYMBOLS = re.compile(r"[→←»«›‹▶►]")
TRAILING_COUNT = re.compile(r"\s\(?\d+\)?$")  # "Ressources humaines 13" = catégorie + compteur


def is_valid_job(job: dict, source: dict) -> bool:
    title = (job.get("title") or "").strip()
    if not 5 <= len(title) <= 150:
        return False
    squashed = re.sub(r"[\W_]+", "", title.lower())
    if squashed in (re.sub(r"[\W_]+", "", source["name"].lower()), source["id"]):
        return False
    if NAV_SYMBOLS.search(title) or TRAILING_COUNT.search(title) or title.endswith("?"):
        return False
    return not NOT_A_JOB.search(title)


CONTRACTS = [
    ("CDI", r"\bcdi\b"),
    ("CDD", r"\bcdd\b"),
    ("Stage", r"\bstages?\b|\bstagiaire\b|\binternship\b"),
    ("Intérim", r"int[ée]rim"),
    ("Freelance", r"freelance|ind[ée]pendant"),
    ("Prestation", r"prestation|consultan"),
    ("Alternance", r"alternance|apprentissage"),
]


def detect_contract(*texts: str) -> str:
    """Premier type de contrat reconnu, texte explicite d'abord. Vide si rien n'est indiqué."""
    for text in texts:
        for label, pattern in CONTRACTS:
            if text and re.search(pattern, text, re.I):
                return label
    return ""

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


def fetch_wp_ajax_jobs(endpoint: str, timeout: int = 20) -> str | None:
    """Interroge l'endpoint AJAX du plugin WordPress "WP Job Manager".
    Ces sites affichent leurs offres via JS après chargement ; la page HTML
    statique est vide, mais l'endpoint admin-ajax.php renvoie le HTML rendu.
    """
    payload = {
        "action": "job_manager_get_listings",
        "search_keywords": "", "search_location": "",
        "per_page": "20", "orderby": "featured", "order": "DESC", "page": "1",
    }
    try:
        r = requests.post(endpoint, data=payload, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        data = r.json()
        html = data.get("html") if data.get("found_jobs") else None
        print(f"  OK  {endpoint}  (AJAX, {len(html) if html else 0} chars)")
        return html
    except Exception as e:
        print(f"  KO  {endpoint}  →  {str(e)[:80]}")
        return None


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


def parse_offreemploi(soup: BeautifulSoup, source: dict) -> list[dict]:
    jobs = []
    for card in soup.select("a.oe-job"):
        text = lambda sel: (card.select_one(sel).get_text(" ", strip=True) if card.select_one(sel) else "")
        title, company, pill = text(".oe-job__title"), text(".oe-job__company"), text(".oe-pill")
        jobs.append({
            "title": title,
            "city": text(".oe-job__location") or source["city"],
            "description": f"{title}{' chez ' + company if company else ''}. Offre publiée sur {source['name']}.",
            "contractType": detect_contract(pill, title),
            "sourceUrl": card.get("href", ""),
        })
    return jobs


def parse_senjob(soup: BeautifulSoup, source: dict) -> list[dict]:
    jobs = []
    for link in soup.select('a[href*="/jobseekers/"]'):
        title_el = link.select_one(".offre_title")
        if not title_el:
            continue
        title = " ".join(title_el.get_text(" ", strip=True).split())
        row = link.find_parent("tr")
        marker = row.select_one(".glyphicon-map-marker") if row else None
        # Senjob tronque parfois la ville : "Dakar (seneg..." -> "Dakar"
        city = marker.parent.get_text(" ", strip=True).split("(")[0].strip() if marker else ""
        jobs.append({
            "title": title,
            "city": city or source["city"],
            "description": f"{title}. Offre publiée sur {source['name']}.",
            "contractType": detect_contract(title),
            "sourceUrl": link.get("href", ""),
        })
    return jobs


PARSERS = {"offreemploi": parse_offreemploi, "senjob": parse_senjob}


def parse_jobs(html: str, source: dict, source_url: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")

    # 1. Parseur dédié quand la structure du site est connue
    if source.get("parser"):
        jobs = PARSERS[source["parser"]](soup, source)
        print(f"  {len(jobs)} offres trouvées via parseur dédié")
        return jobs

    # 2. Extraction JSON (SPAs), uniquement pour les sources qui l'exposent
    if source.get("json_extract"):
        jobs = extract_from_json_scripts(soup)
        if jobs:
            print(f"  {len(jobs)} offres trouvées via JSON embarqué")
            return jobs

    # 3. Sélecteurs CSS courants (WP Job Manager, etc.)
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
            contract_el = item.select_one(".job-type,.contract,.contrat,.type-contrat,.type")
            contract_text = contract_el.get_text(strip=True)[:30] if contract_el else ""
            link = item if item.name == "a" else item.find("a", href=True)
            jobs.append({
                "title": title,
                "city": city,
                "description": desc or f"Offre disponible sur {source['name']}",
                "contractType": detect_contract(contract_text, title),
                "sourceUrl": link.get("href", "") if link else "",
            })
        if jobs:
            print(f"  {len(jobs)} offres trouvées via sélecteur '{sel}'")
            return jobs

    # Pas de repli sur les liens de la page ni sur le JSON non ciblé :
    # ils ne remontaient que des menus, des catégories et le nom du site.
    return []


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


def scrape_source(db, source: dict, dry_run: bool = False) -> int:
    print(f"\n[{source['name']}]")
    if source.get("wp_ajax"):
        html = fetch_wp_ajax_jobs(source["wp_ajax"])
        used_url = source["urls"][0] if source.get("urls") else source["wp_ajax"]
    else:
        html, used_url = fetch_html(source["urls"])
    if not html:
        return 0

    jobs = parse_jobs(html, source, used_url)
    valid = [j for j in jobs if is_valid_job(j, source)]
    if len(valid) < len(jobs):
        print(f"  {len(jobs) - len(valid)} éléments écartés (pas des offres)")
    jobs = valid
    if source.get("senegal_only"):
        before = len(jobs)
        jobs = [j for j in jobs if is_senegal_job(j)]
        if len(jobs) < before:
            print(f"  {before - len(jobs)} offres hors Sénégal écartées")
    if not jobs:
        print("  Aucune offre trouvée.")
        return 0

    if dry_run:
        for job in jobs:
            print(f"   - {job['title'][:90]} | {job['city'][:30]} | {job['contractType'] or 'contrat non précisé'}")
        return len(jobs)

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
            "sourceUrl": job.get("sourceUrl") or used_url,
            "duration": "Non précisé",
            "sector": detect_sector(job["title"] + " " + job["description"]),
            "companyId": f"scraped_{source['id']}",
            "companyName": source["name"],
            "status": "published",
            "source": source["id"],
            "scrapedAt": firestore.SERVER_TIMESTAMP,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })
        existing_titles.add(job["title"].lower())
        added += 1

    print(f"  +{added} offres ajoutées")
    return added


def purge_invalid_jobs(db) -> int:
    """Supprime les missions importées qui ne passent plus la validation
    (menus, catégories, forum...) ainsi que celles des sources retirées."""
    sources = {s["id"]: s for s in SOURCES}
    ids = list(sources) + REMOVED_SOURCES
    batch, count = db.batch(), 0
    for doc in db.collection("missions").where(filter=FieldFilter("source", "in", ids)).stream():
        data = doc.to_dict()
        source = sources.get(data.get("source"))
        # Pour les sources à parseur dédié, une URL égale à la page de liste
        # signale une entrée de l'ancien repli sur les liens (menus, catégories).
        legacy = bool(source and source.get("parser") and data.get("sourceUrl") in source["urls"])
        if source is None or legacy or not is_valid_job(data, source):
            batch.delete(doc.reference)
            count += 1
            if count % 499 == 0:
                batch.commit()
                batch = db.batch()
    if count % 499:
        batch.commit()
    print(f"\nSupprimées : {count} fausses offres importées")
    return count


def migrate_public_pay(db) -> int:
    """Retire le champ "pay" des documents missions, lisibles publiquement.
    Pour une mission publiée par une entreprise, le salaire est d'abord copié
    dans missions/{id}/private/terms (lecture réservée à l'admin et à l'entreprise).
    Idempotent : une fois la migration faite, la requête ne renvoie plus rien."""
    count = 0
    for doc in db.collection("missions").order_by("pay").stream():
        data = doc.to_dict()
        batch = db.batch()
        if not data.get("source"):
            terms = doc.reference.collection("private").document("terms")
            if not terms.get().exists:
                batch.set(terms, {"pay": data.get("pay") or "", "updatedAt": firestore.SERVER_TIMESTAMP})
        batch.update(doc.reference, {"pay": firestore.DELETE_FIELD})
        batch.commit()
        count += 1
    if count:
        print(f"\nSalaire retiré de {count} missions publiques")
    return count


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
    # --dry-run : affiche ce qui serait importé, sans lire ni écrire dans Firestore.
    if "--dry-run" in sys.argv:
        total = 0
        for source in SOURCES:
            try:
                total += scrape_source(None, source, dry_run=True)
            except Exception as e:
                print(f"  ERREUR [{source['name']}]: {e}")
        print(f"\n=== Dry run : {total} offres valides ===")
        return

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

    migrate_public_pay(db)
    purged = purge_invalid_jobs(db)
    deleted = clean_old_jobs(db)
    print(f"\n=== Scraping terminé : +{total} ajoutées, {purged + deleted} supprimées ===")


if __name__ == "__main__":
    main()

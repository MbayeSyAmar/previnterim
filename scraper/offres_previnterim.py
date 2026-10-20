# -*- coding: utf-8 -*-
"""Publie le catalogue d'offres propres a PrevInterim.

Les offres importees viennent des sites d'emploi et disparaissent au bout de
cinq jours (SCRAPE_TTL_DAYS). Celles-ci sont les offres de l'agence elle-meme :
elles restent en place, et elles garantissent que chaque secteur du filtre a du
contenu, au lieu d'un filtre qui renvoie zero resultat.

Deux champs sont volontairement absents, et il ne faut pas les ajouter :

  - `source`    : `purge_invalid_jobs` supprime toute mission dont la source
                  n'est pas une source connue. Une offre maison tagguee
                  `previnterim` serait effacee au prochain passage du scraper.
  - `scrapedAt` : `clean_old_jobs` supprime toute mission dont le `scrapedAt`
                  depasse cinq jours.

Une requete Firestore ne renvoie jamais un document auquel le champ manque,
donc ne rien ecrire est exactement ce qui protege ces offres.

Le salaire ne va pas dans le document public : les regles l'interdisent, parce
que `missions/{id}` est lisible sans compte. Il est ecrit dans
`missions/{id}/private/terms`, comme le fait `createMission` cote navigateur.

L'identifiant du document est derive du titre, donc relancer le script met les
offres a jour au lieu de les dupliquer.

Usage :
    python offres_previnterim.py --dry-run
    python offres_previnterim.py
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT = Path(__file__).with_name("serviceAccount.json")

AGENCE_ID = "previnterim"
AGENCE_NOM = "PrevInterim"

# Les offres, par secteur. Le libelle de secteur doit exister dans SECTORS, a la
# fois dans scrape.py et dans app.js, sinon l'offre n'est atteignable par aucun
# filtre.
#
# Les remunerations sont des fourchettes indicatives du marche senegalais de
# l'interim, a revoir avant diffusion : elles ne sont visibles que par l'equipe
# PrevInterim, jamais par les candidats.
OFFRES: list[dict] = []


def offre(titre, secteur, ville, duree, pay, description, contrat="Intérim"):
    OFFRES.append({
        "title": titre, "sector": secteur, "city": ville, "contractType": contrat,
        "duration": duree, "pay": pay, "description": description,
    })


# --------------------------------------------------------------- Hotellerie
H = "Hôtellerie / Restauration"
offre("Réceptionniste d'hôtel", H, "Dakar", "6 mois", "180 000 - 220 000 FCFA/mois",
      "Accueil et enregistrement des clients, gestion des arrivées et des départs, réponse aux "
      "demandes par téléphone et par e-mail, facturation et encaissement. Français et anglais "
      "courants demandés, une troisième langue appréciée. Travail en rotation, "
      "week-ends et jours fériés inclus.")
offre("Serveur / Serveuse en salle", H, "Dakar", "3 mois renouvelable", "120 000 - 150 000 FCFA/mois",
      "Mise en place de la salle, prise de commande, service à l'assiette, encaissement et "
      "débarrassage. Une première expérience en restaurant ou en hôtel est demandée. "
      "Présentation soignée et sens du client indispensables.")
offre("Chef de rang", H, "Saly", "Saison 6 mois", "170 000 - 210 000 FCFA/mois",
      "Encadrement d'une équipe de serveurs sur un rang, accueil et conseil des clients, suivi de "
      "la qualité du service et de la coordination avec la cuisine. Trois ans d'expérience en "
      "restauration de standing demandés.")
offre("Commis de cuisine", H, "Dakar", "3 mois", "110 000 - 140 000 FCFA/mois",
      "Épluchage et préparation des produits, assistance aux cuisiniers sur les entrées et "
      "les garnitures, entretien du poste de travail et respect des règles d'hygiène. "
      "Formation en cuisine ou expérience équivalente.")
offre("Cuisinier", H, "Mbour", "Saison 5 mois", "180 000 - 230 000 FCFA/mois",
      "Production chaude ou froide en autonomie sur un poste, dressage des assiettes, gestion des "
      "stocks du poste et application du plan de maîtrise sanitaire. Expérience en restauration "
      "collective ou hôtelière exigée.")
offre("Femme / Valet de chambre", H, "Dakar", "4 mois", "100 000 - 130 000 FCFA/mois",
      "Remise en état des chambres et des sanitaires, réapprovisionnement du linge et des "
      "produits d'accueil, signalement des anomalies à la gouvernante. Rythme soutenu, "
      "cadence d'une quinzaine de chambres par service.")
offre("Plongeur en restauration", H, "Dakar", "2 mois renouvelable", "90 000 - 110 000 FCFA/mois",
      "Lavage de la vaisselle et du matériel de cuisine, entretien des locaux et sortie des "
      "déchets. Poste debout, environnement chaud et humide. Aucun diplôme exigé, "
      "ponctualité et endurance demandées.")
offre("Barman", H, "Saly", "Saison 6 mois", "140 000 - 180 000 FCFA/mois",
      "Préparation des boissons et des cocktails, tenue du bar et de la caisse, gestion des "
      "stocks et des commandes. Connaissance de la carte des cocktails classiques et "
      "expérience en bar d'hôtel appréciées.")

# --------------------------------------------------------------- Logistique
L = "Transport / Logistique"
offre("Cariste", L, "Diamniadio", "6 mois", "150 000 - 190 000 FCFA/mois",
      "Chargement et déchargement de camions, gerbage et rangement en racks, saisie des "
      "mouvements de stock. CACES ou autorisation de conduite de chariot élévateur exigée, "
      "catégories 1, 3 ou 5 selon le site.")
offre("Magasinier", L, "Dakar", "6 mois", "140 000 - 175 000 FCFA/mois",
      "Réception et contrôle des marchandises, rangement, préparation des sorties et "
      "inventaires tournants. Maîtrise d'un logiciel de gestion de stock demandée, "
      "Excel indispensable.")
offre("Préparateur de commandes", L, "Rufisque", "3 mois renouvelable", "110 000 - 140 000 FCFA/mois",
      "Prélèvement des articles sur listes de picking, constitution et filmage des palettes, "
      "contrôle des quantités avant expédition. Travail cadencé, port de charges répété.")
offre("Chauffeur livreur poids lourd", L, "Dakar", "6 mois", "200 000 - 260 000 FCFA/mois",
      "Livraison de marchandises en région de Dakar et vers l'intérieur du pays, contrôle des "
      "bons de livraison, veille au chargement et à l'arrimage. Permis C en cours de validité "
      "et expérience de la conduite de poids lourd exigés.")
offre("Chauffeur livreur véhicule léger", L, "Dakar", "3 mois", "130 000 - 160 000 FCFA/mois",
      "Tournées de livraison en milieu urbain, remise des colis et encaissement éventuel, "
      "entretien courant du véhicule. Permis B depuis trois ans minimum, bonne connaissance "
      "de l'agglomération dakaroise.")
offre("Manutentionnaire", L, "Dakar", "2 mois renouvelable", "90 000 - 115 000 FCFA/mois",
      "Chargement et déchargement manuel, tri et déplacement des colis, aide à la "
      "préparation des expéditions. Poste physique, port de charges jusqu'à 25 kg. "
      "Aucun diplôme exigé.")
offre("Agent de quai", L, "Diamniadio", "4 mois", "120 000 - 150 000 FCFA/mois",
      "Réception et éclatement des flux sur quai, scan des colis, tri par destination et "
      "chargement des départs. Travail en horaires décalés, démarrage tôt le matin.")

# --------------------------------------------------------------------- BTP
B = "BTP / Construction"
offre("Maçon", B, "Dakar", "6 mois", "150 000 - 200 000 FCFA/mois",
      "Montage de murs en agglos et en briques, réalisation de chapes et d'enduits, lecture de "
      "plans simples. Trois ans d'expérience minimum sur chantier de bâtiment.")
offre("Coffreur-bancheur", B, "Diamniadio", "8 mois", "180 000 - 240 000 FCFA/mois",
      "Pose et réglage des banches, coulage et décoffrage des voiles et des planchers, "
      "réservations et étaiement. Expérience en gros oeuvre et habitude du travail en "
      "hauteur exigées.")
offre("Ferrailleur", B, "Dakar", "6 mois", "160 000 - 210 000 FCFA/mois",
      "Lecture des plans de ferraillage, façonnage et assemblage des armatures, mise en place "
      "dans les coffrages. Précision et respect des cotes indispensables.")
offre("Électricien de chantier", B, "Dakar", "6 mois", "200 000 - 260 000 FCFA/mois",
      "Tirage de câbles, pose d'appareillage et de tableaux, raccordements et essais avant mise "
      "sous tension. Habilitation électrique à jour et lecture de schémas exigées.")
offre("Plombier sanitaire", B, "Thiès", "4 mois", "170 000 - 220 000 FCFA/mois",
      "Pose de réseaux d'alimentation et d'évacuation, installation d'appareils sanitaires, "
      "recherche de fuites et mise en service. Soudure cuivre et travail du PVC maîtrisés.")
offre("Conducteur d'engins de chantier", B, "Diamniadio", "8 mois", "220 000 - 290 000 FCFA/mois",
      "Conduite de pelle, de chargeuse ou de compacteur selon les besoins du chantier, "
      "terrassement et nivellement, contrôles de sécurité avant prise de poste. "
      "Autorisation de conduite exigée, permis C apprécié.")
offre("Chef d'équipe gros oeuvre", B, "Dakar", "8 mois", "280 000 - 350 000 FCFA/mois",
      "Encadrement d'une équipe de cinq à dix compagnons, répartition des tâches, suivi de "
      "l'avancement et du respect des consignes de sécurité, point quotidien avec le conducteur "
      "de travaux. Cinq ans d'expérience dont deux en encadrement.")
offre("Manoeuvre bâtiment", B, "Dakar", "3 mois renouvelable", "95 000 - 120 000 FCFA/mois",
      "Approvisionnement des postes de travail, préparation du mortier, aide aux maçons et "
      "nettoyage du chantier. Poste d'entrée, formation assurée sur place.")

# ---------------------------------------------------------------- Industrie
I = "Industrie / Production"
offre("Opérateur de production", I, "Rufisque", "6 mois", "120 000 - 155 000 FCFA/mois",
      "Conduite d'une ligne ou d'une machine, surveillance des paramètres, contrôle visuel des "
      "produits et renseignement des fiches de production. Travail en 2x8 ou en 3x8 selon le site.")
offre("Technicien de maintenance industrielle", I, "Dakar", "12 mois", "280 000 - 380 000 FCFA/mois",
      "Maintenance préventive et corrective sur équipements de production, diagnostic de pannes "
      "mécaniques, électriques et pneumatiques, renseignement de la GMAO. BTS maintenance ou "
      "équivalent, trois ans d'expérience en milieu industriel.")
offre("Soudeur", I, "Dakar", "6 mois", "190 000 - 250 000 FCFA/mois",
      "Soudure à l'arc et semi-automatique sur acier, lecture de plans et de symboles de soudure, "
      "contrôle visuel des cordons. Qualification MIG/MAG ou TIG appréciée.")
offre("Électromécanicien", I, "Rufisque", "12 mois", "260 000 - 340 000 FCFA/mois",
      "Interventions mécaniques et électriques sur machines de production, remplacement "
      "d'organes, réglages et remise en service. Habilitation électrique exigée.")
offre("Mécanicien industriel", I, "Thiès", "8 mois", "220 000 - 290 000 FCFA/mois",
      "Démontage et remontage d'ensembles mécaniques, changement de roulements et de "
      "transmissions, alignements et graissage. Lecture de plans mécaniques demandée.")
offre("Agent de conditionnement", I, "Dakar", "3 mois renouvelable", "95 000 - 120 000 FCFA/mois",
      "Mise en carton et étiquetage des produits en fin de ligne, contrôle de conformité et "
      "palettisation. Cadence soutenue, station debout. Aucun diplôme exigé.")
offre("Contrôleur qualité", I, "Rufisque", "6 mois", "180 000 - 230 000 FCFA/mois",
      "Prélèvements et contrôles en cours de production, mesures dimensionnelles, "
      "enregistrement des non-conformités et alerte de la production. Rigueur et "
      "maîtrise des outils de mesure demandées.")

# -------------------------------------------------------- Nettoyage services
N = "Nettoyage / Services"
offre("Agent de nettoyage", N, "Dakar", "6 mois", "90 000 - 115 000 FCFA/mois",
      "Nettoyage de bureaux, de sanitaires et de parties communes, vidage des corbeilles et "
      "réapprovisionnement des consommables. Horaires en début ou en fin de journée. "
      "Aucun diplôme exigé, sérieux et discrétion demandés.")
offre("Agent d'entretien des locaux", N, "Keur Massar", "6 mois", "95 000 - 120 000 FCFA/mois",
      "Entretien quotidien de locaux tertiaires ou scolaires, lavage des sols, dépoussiérage "
      "et désinfection des points de contact, gestion du matériel confié.")
offre("Agent de nettoyage industriel", N, "Rufisque", "6 mois", "120 000 - 150 000 FCFA/mois",
      "Nettoyage de zones de production et d'ateliers, utilisation d'autolaveuse et de "
      "nettoyeur haute pression, respect des consignes de sécurité en milieu industriel. "
      "Expérience du nettoyage en usine appréciée.")
offre("Laveur de vitres", N, "Dakar", "4 mois", "130 000 - 165 000 FCFA/mois",
      "Nettoyage de surfaces vitrées en intérieur et en extérieur, travail sur perche "
      "télescopique et sur nacelle. Aptitude au travail en hauteur exigée.")
offre("Chef d'équipe propreté", N, "Dakar", "8 mois", "180 000 - 230 000 FCFA/mois",
      "Organisation des tournées d'une équipe de cinq à dix agents, contrôle de la qualité "
      "des prestations, gestion des produits et du matériel, interface avec le client. "
      "Deux ans d'expérience en propreté dont une en encadrement.")
offre("Agent polyvalent de services généraux", N, "Dakar", "6 mois", "120 000 - 150 000 FCFA/mois",
      "Petits travaux d'entretien, manutention interne, gestion des consommables et appui "
      "logistique aux équipes du site. Polyvalence et autonomie demandées.")

# ----------------------------------------------------------------- Securite
S = "Sécurité / Gardiennage"
offre("Agent de sécurité", S, "Dakar", "6 mois", "110 000 - 140 000 FCFA/mois",
      "Contrôle des accès, filtrage des visiteurs, rondes de surveillance et rédaction des "
      "mains courantes. Carte professionnelle et casier judiciaire vierge exigés. "
      "Postes de jour et de nuit, en rotation.")
offre("Agent de sécurité incendie", S, "Dakar", "12 mois", "160 000 - 200 000 FCFA/mois",
      "Surveillance du système de sécurité incendie, levée de doute sur alarme, contrôle des "
      "moyens de secours et assistance à l'évacuation. Qualification SSIAP 1 ou équivalent "
      "exigée, secourisme à jour.")
offre("Agent de surveillance en magasin", S, "Dakar", "4 mois renouvelable", "115 000 - 145 000 FCFA/mois",
      "Prévention des vols en surface de vente, surveillance par vidéoprotection, intervention "
      "et rédaction des rapports. Sang-froid et maîtrise de soi indispensables.")
offre("Gardien de site", S, "Keur Massar", "6 mois", "100 000 - 125 000 FCFA/mois",
      "Gardiennage d'un site fermé, ouverture et fermeture, rondes périodiques et tenue du "
      "registre d'entrées et de sorties. Postes de nuit et de week-end.")
offre("Maître-chien", S, "Diamniadio", "8 mois", "180 000 - 230 000 FCFA/mois",
      "Surveillance de site avec chien, rondes dissuasives et levée de doute. Conducteur "
      "cynophile diplômé, maîtrise du chien et carnet sanitaire à jour exigés.")
offre("Superviseur de sécurité", S, "Dakar", "12 mois", "230 000 - 300 000 FCFA/mois",
      "Encadrement des agents sur plusieurs sites, planification des vacations, contrôle des "
      "prestations et reporting au client. Cinq ans d'expérience en sûreté dont deux en "
      "encadrement.")


def identifiant(titre: str, ville: str) -> str:
    """Identifiant stable derive du titre et de la ville, pour que relancer le
    script mette les offres a jour au lieu de les dupliquer."""
    brut = f"{titre} {ville}"
    sans_accent = unicodedata.normalize("NFKD", brut).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", sans_accent.lower()).strip("-")
    return f"pvi-{slug}"


def verifier_secteurs(chemin_app: Path) -> list[str]:
    """Compare les secteurs des offres a la liste SECTORS de app.js.

    Un libelle absent du filtre produit une offre que personne ne peut trouver,
    exactement le probleme que ce script est cense corriger."""
    source = chemin_app.read_text(encoding="utf-8")
    bloc = re.search(r"const SECTORS = \[(.*?)\];", source, re.S)
    if not bloc:
        return ["liste SECTORS introuvable dans app.js"]
    connus = set(re.findall(r"'([^']+)'", bloc.group(1)))
    inconnus = sorted({o["sector"] for o in OFFRES} - connus)
    return [f"secteur absent de app.js : {s}" for s in inconnus]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="affiche ce qui serait ecrit, sans rien ecrire")
    args = parser.parse_args()

    fautes = verifier_secteurs(Path(__file__).resolve().parents[1] / "app.js")
    if fautes:
        for f in fautes:
            print(f"  ERREUR : {f}")
        return 1

    par_secteur: dict[str, int] = {}
    for o in OFFRES:
        par_secteur[o["sector"]] = par_secteur.get(o["sector"], 0) + 1

    print(f"{len(OFFRES)} offres dans {len(par_secteur)} secteurs")
    for s, n in sorted(par_secteur.items(), key=lambda kv: -kv[1]):
        print(f"  {n:3}  {s}")

    ids = [identifiant(o["title"], o["city"]) for o in OFFRES]
    doublons = {i for i in ids if ids.count(i) > 1}
    if doublons:
        print(f"\n  ERREUR : identifiants en double : {sorted(doublons)}")
        return 1

    if args.dry_run:
        print("\n--dry-run : rien n'a ete ecrit.")
        for o, i in zip(OFFRES, ids):
            print(f"  {i:52} {o['city']:12} {o['duration']}")
        return 0

    if not SERVICE_ACCOUNT.exists():
        print(f"  ERREUR : {SERVICE_ACCOUNT} introuvable.")
        return 1

    firebase_admin.initialize_app(credentials.Certificate(str(SERVICE_ACCOUNT)))
    db = firestore.client()

    # L'agence est sa propre entreprise cliente pour ces offres. Sans ce
    # document, l'espace entreprise et les ecrans d'administration afficheraient
    # un companyId qui ne correspond a rien.
    db.collection("companies").document(AGENCE_ID).set({
        "companyName": AGENCE_NOM,
        "city": "Dakar",
        "status": "active",
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }, merge=True)
    print(f"\nEntreprise {AGENCE_ID} a jour")

    ecrites = 0
    for o, ident in zip(OFFRES, ids):
        pay = o.pop("pay")
        ref = db.collection("missions").document(ident)
        existe = ref.get().exists
        lot = db.batch()
        lot.set(ref, {
            **o,
            "companyId": AGENCE_ID,
            "companyName": AGENCE_NOM,
            "status": "published",
            "updatedAt": firestore.SERVER_TIMESTAMP,
            **({} if existe else {"createdAt": firestore.SERVER_TIMESTAMP}),
        }, merge=True)
        lot.set(ref.collection("private").document("terms"),
                {"pay": pay, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
        lot.commit()
        ecrites += 1
        print(f"  {'maj ' if existe else 'creee'}  {ident}")

    print(f"\n{ecrites} offres publiees sur {len(OFFRES)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

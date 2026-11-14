# Objectif Grand Oral

Application de préparation au **Grand Oral du CRFPA** (libertés et droits fondamentaux), dans le même style qu'Objectif Anglais.
Au lieu de relire des fiches, l'application pose une question (« Conditions de la garde à vue », « Portée de l'arrêt Benjamin »…),
tu cherches la réponse de mémoire (**rappel actif**), puis tu dis si tu t'en souvenais : l'algorithme de **répétition espacée**
calcule la date de la prochaine révision.

| Réponse | Effet sur l'intervalle | Exemple |
|---|---|---|
| **Facile** | multiplié par la facilité de la carte (2,5 au départ) | 3 j → 8 j |
| **Difficile** | augmente peu (× 1,2, au moins + 1 jour) | 3 j → 4 j |
| **Oublié** | retombe à 1 jour (et la carte revient plus tard dans la séance) | 3 j → 1 j |

Première rencontre : *Facile* → 3 jours, sinon demain. Avec la date du Grand Oral renseignée, aucune carte n'est programmée après la veille de l'épreuve.
Détails : [docs/architecture.md](docs/architecture.md). Vérification : `node tools/check_srs.mjs`.

## Lancer l'application
```bash
cd app && python3 -m http.server 8000
```
Ouvre http://localhost:8000. Sur mobile : menu du navigateur → « Ajouter à l'écran d'accueil ».
**Application iPhone** (Capacitor + Xcode) : voir [docs/iphone.md](docs/iphone.md).

## Contenu
- **Programme** : 8 parties et 56 fiches. Chaque fiche affiche sa fiche-mémoire (accroche, définition, cinq références,
  deux plans, trois pièges, sujets d'exposé) avec le code couleur (textes en bleu, jurisprudence en rose, doctrine en vert,
  gras à réciter), et donne ses cartes : portée des décisions, définitions, plans, relances du jury, angles morts, textes, doctrine.
  *Essentiel* : fiche-mémoire et dispositif « Grand Oral » ; *Complet* : avec le dossier détaillé.
- **Questions** : banque de 554 questions du jury (niveaux Base, Approfondi, Piège). Recherche dans toutes les cartes.
- **Oral** : entretien express (10 questions du jury, 1 min chacune), questions pièges, tirage d'un sujet d'exposé
  avec chronomètre (1 h de préparation, 15 min d'exposé, enregistrement facultatif) puis entretien.
- **Profil** : date du Grand Oral (compte à rebours), nouvelles cartes par jour (10 à 80), essentiel ou complet,
  progression par partie, sauvegarde dans un fichier.

## Mettre à jour les cartes
Les fichiers `app/data/cours.json` et `app/data/jury.json` sont désormais la référence : ils ont été nettoyés à la main
(mentions de supports tiers, cartes personnelles, banque de 500 questions retirée). **Ne pas relancer `tools/build_cards.py`** :
il régénérerait ces fichiers depuis les documents sources et annulerait ce nettoyage.
Contrôle des données : `node tools/check_data.mjs`.

## Crédits
- Police : Plus Jakarta Sans — SIL Open Font License.

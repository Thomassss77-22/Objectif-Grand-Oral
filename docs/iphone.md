# Installer Objectif Grand Oral sur iPhone (Xcode)

L'application iPhone est le même code que le site (`app/`), emballé avec [Capacitor](https://capacitorjs.com).
Tout est inclus dans l'application : elle fonctionne sans site web et hors ligne.

## Ce qu'il faut
- Un Mac avec **Xcode** (App Store, gratuit) et **Node.js** (version LTS sur nodejs.org).
- Un **identifiant Apple** (un compte gratuit suffit).
- L'iPhone et son câble.

## Première installation
1. **Récupérer le projet.** Dans le Terminal (le dépôt étant privé, GitHub demandera de te connecter ; GitHub Desktop marche aussi) :
   ```bash
   git clone https://github.com/Thomassss77-22/Objectif-Grand-Oral.git
   cd Objectif-Grand-Oral
   npm install
   npm run ios
   ```
   `npm run ios` copie l'application dans le projet iOS et ouvre Xcode.
2. **Signer l'application.** Dans Xcode, clique sur **App** (en haut de la colonne de gauche), onglet **Signing & Capabilities** :
   - **Team** → *Add an Account…* → connecte ton identifiant Apple, puis choisis *(ton nom) (Personal Team)* ;
   - si Xcode signale que l'identifiant est déjà pris, remplace **Bundle Identifier** `fr.objectifgrandoral.app`
     par un nom unique, par exemple `fr.objectifgrandoral.thomas`.
3. **Brancher l'iPhone**, le déverrouiller et toucher **Se fier à cet ordinateur**.
4. **Activer le mode développeur** sur l'iPhone : *Réglages → Confidentialité et sécurité → Mode développeur* → activer,
   puis redémarrer (l'option apparaît après le premier branchement à Xcode).
5. En haut de Xcode, choisis **ton iPhone** dans la liste des appareils, puis clique sur **▶ (Run)**.
6. Au premier lancement, l'iPhone peut refuser d'ouvrir l'app : *Réglages → Général → VPN et gestion de l'appareil* →
   ton identifiant Apple → **Faire confiance**. Relance l'app.

## Mettre à jour l'application
```bash
cd Objectif-Grand-Oral
git pull
npm run ios
```
puis **▶ Run** dans Xcode avec l'iPhone branché. Ta progression est conservée.

## À savoir
- **Compte Apple gratuit : l'application expire au bout de 7 jours.** Il suffit de rebrancher l'iPhone et de refaire ▶ Run
  (la progression reste). Avec le programme développeur Apple (99 $/an), elle dure un an et peut passer par TestFlight.
- **Sauvegarde** : dans l'app, *Profil → Sauvegarde → Télécharger* ouvre la feuille de partage (Fichiers, AirDrop, e-mail…).
  Fais-en une avant de supprimer l'application, sinon la progression est perdue.
- **Micro** : il sert aux simulations d'exposé (enregistrement pour se réécouter) ; l'iPhone demande l'autorisation.

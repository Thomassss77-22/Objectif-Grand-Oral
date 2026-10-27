# Architecture

Même socle qu'Objectif Anglais : une PWA en HTML/CSS/JavaScript sans framework ni build, qui fonctionne hors ligne,
emballée pour iPhone avec Capacitor. Progression dans `localStorage`.

## Structure
```
app/
  index.html, style.css   coquille et styles (mobile d'abord, mode sombre, couleur par partie)
  app.js                  écrans : programme, fiche, séance, questions, oral, profil
  srs.js                  répétition espacée à trois réponses
  data/cours.json         8 parties, 56 fiches (fiche-mémoire + cartes)
  data/jury.json          580 questions du jury, en chapitres et sections
  data/q500.json          500 questions-réponses, en sections
  sw.js, manifest.json    hors ligne et installation
tools/
  build_cards.py          compile les documents de « Grand Oral/ » vers app/data/
  check_srs.mjs           tests de l'algorithme
  make_icons.py           logo, icônes, écran de démarrage iPhone
```

## Cartes
`{ id, k, q, a, ctx, core? }` pour le cours (`a` en HTML : `<b>` gras, `<i class="t|j|d">` textes, jurisprudence, doctrine) ;
`{ id, num, lv, who, q, a, cite }` pour le jury ; `{ id, num, q, a, upd? }` pour les 500 questions.

Types de cartes tirées des fiches (`k`) : `ref` (portée d'une décision), `def`, `plan`, `jury` (relances), `qr` (angles morts),
`texte`, `doct`, `notion`. `core` marque la fiche-mémoire et le dispositif « Grand Oral ».

## Répétition espacée (`srs.js`)
État d'une carte : `{ iv, ease, reps, lapses, due, last }` (intervalle en jours, facilité, date de la prochaine révision).
- Facile : `iv × ease` (au moins `iv + 1`), 3 j la première fois ; `ease + 0,1`.
- Difficile : `iv × 1,2` (au moins `iv + 1`), 1 j la première fois ; `ease − 0,15`.
- Oublié : 1 j ; `ease − 0,2`. Dans la séance, la carte revient après 4 autres jusqu'à être retrouvée (sans changer son calendrier).
- `ease` entre 1,3 et 3 ; intervalle maximal 90 j, et jamais au-delà de la veille du Grand Oral.
- La date de révision tombe à minuit (heure locale) : une carte prévue « dans 3 jours » est disponible dès le matin.

Nouvelles cartes : « Étudier maintenant » sur une fiche les présente tout de suite ; « Ajouter à mes révisions » les met
en file, introduites au rythme choisi (30 par jour par défaut).

// Vérifie l'algorithme de répétition espacée sur les exemples du cahier des charges.
// Usage : node tools/check_srs.mjs
import assert from "node:assert/strict";
import { newCard, review, nextInterval, DAY, MAX_DAYS, startOfDay } from "../app/srs.js";

const now = new Date(2026, 9, 27, 21, 30).getTime();
const card3 = { ...newCard(now), iv: 3, reps: 2, last: now - 3 * DAY };

assert.equal(review(card3, "easy", now).iv, 8, "Facile : 3 j → 8 j");
assert.equal(review(card3, "hard", now).iv, 4, "Difficile : 3 j → 4 j");
assert.equal(review(card3, "again", now).iv, 1, "Oublié : retour à 1 j");

const fresh = newCard(now);
assert.equal(review(fresh, "easy", now).iv, 3, "Nouvelle carte facile : 3 j");
assert.equal(review(fresh, "hard", now).iv, 1, "Nouvelle carte difficile : demain");
assert.equal(review(fresh, "again", now).iv, 1, "Nouvelle carte oubliée : demain");

// La carte est disponible dès minuit du jour prévu, quelle que soit l'heure de la révision.
assert.equal(review(card3, "hard", now).due, startOfDay(now) + 4 * DAY);

// « Acquis » : quelques « Facile » d'affilée mènent à un mois et plus.
let c = fresh, t = now;
const path = [];
for (let i = 0; i < 4; i++) { c = review(c, "easy", t); path.push(c.iv); t = c.due; }
assert.deepEqual(path, [3, 8, 22, 62]);
assert.ok(review({ ...c, iv: 80 }, "easy", t).iv === MAX_DAYS, "plafond");

// Difficile répété : la facilité baisse, l'intervalle progresse lentement mais toujours.
c = { ...card3 };
for (let i = 0; i < 5; i++) { const n = review(c, "hard", now); assert.ok(n.iv > c.iv); c = n; }
assert.ok(c.ease >= 1.3);

// Date de l'examen : aucune carte programmée au-delà de la veille.
const exam = "2026-11-05"; // dans 9 jours
assert.equal(review({ ...card3, iv: 20 }, "easy", now, exam).iv, 8);
assert.equal(review(card3, "hard", now, exam).iv, 4);
assert.equal(nextInterval({ iv: 3, ease: 2.5 }, "easy"), 8);

console.log("srs : tous les tests passent", path.join(" → "), "jours");

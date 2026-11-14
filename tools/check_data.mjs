// Contrôle des données de l'application. Lancer : node tools/check_data.mjs
// Échoue si une carte est vide, si un identifiant est en double, ou si un nom de support tiers réapparaît.
import { readFileSync } from "node:fs";
const load = (f) => JSON.parse(readFileSync(new URL(`../app/data/${f}.json`, import.meta.url), "utf8"));
const cours = load("cours"), jury = load("jury");
const cards = [
  ...cours.fiches.flatMap((f) => f.cards),
  ...jury.chapters.flatMap((ch) => ch.sections.flatMap((s) => s.cards)),
];
const text = (s) => String(s || "").replace(/<[^>]+>/g, "").trim();
const FORBIDDEN = /fascicule|objectif barreau|pr[ée]-?barreau|\bIEJ\b|CHAPITRE \d+ · Q\d+/i;
const problems = [];
const ids = new Set();
for (const c of cards) {
  if (ids.has(c.id)) problems.push(`identifiant en double : ${c.id}`);
  ids.add(c.id);
  if (!text(c.q)) problems.push(`question vide : ${c.id}`);
  if (!text(c.a)) problems.push(`réponse vide : ${c.id}`);
  if (FORBIDDEN.test(`${c.q} ${c.a} ${c.ctx || ""}`)) problems.push(`mention à retirer : ${c.id}`);
}
const rest = JSON.stringify([cours.parts, cours.fiches.map((f) => [f.title, f.memo, f.sujets])]);
if (FORBIDDEN.test(rest)) problems.push("mention à retirer dans un titre, une fiche-mémoire ou un sujet");
const long = cards.filter((c) => text(c.a).split(/\s+/).length > 150).length;
console.log(`${cards.length} cartes contrôlées · ${long} réponses de plus de 150 mots (à scinder)`);
problems.slice(0, 20).forEach((p) => console.log("PROBLÈME", p));
if (problems.length > 20) console.log(`… et ${problems.length - 20} autres`);
process.exit(problems.length ? 1 : 0);

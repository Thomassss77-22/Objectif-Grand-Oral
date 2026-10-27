// Répétition espacée à trois réponses.
// - « Facile » : l'intervalle est multiplié par la facilité de la carte (2,5 au départ : 3 j → 8 j).
// - « Difficile » : l'intervalle augmente peu (× 1,2, au moins + 1 jour : 3 j → 4 j).
// - « Oublié » : la carte retombe à 1 jour.
// Première rencontre : « Facile » → 3 jours, « Difficile » ou « Oublié » → demain.
// La facilité s'ajuste à chaque réponse (+0,1 / −0,15 / −0,2, entre 1,3 et 3), si bien qu'une carte
// souvent difficile revient plus souvent. L'intervalle ne dépasse pas MAX_DAYS, ni la veille du Grand Oral.
export const DAY = 24 * 60 * 60 * 1000;
export const MAX_DAYS = 90;
export const GRADES = [
  ["again", "Oublié"],
  ["hard", "Difficile"],
  ["easy", "Facile"],
];

export function newCard(now = Date.now()) {
  return { iv: 0, ease: 2.5, reps: 0, lapses: 0, due: now };
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Minuit (heure locale) du jour de t : une carte prévue « dans 3 jours » est disponible dès le matin.
export const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

// Nombre de jours avant la date de l'examen (« AAAA-MM-JJ »), ou null.
export function daysUntil(exam, now = Date.now()) {
  if (!exam) return null;
  const [y, m, d] = exam.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Math.round((new Date(y, m - 1, d).getTime() - startOfDay(now)) / DAY);
}

export function nextInterval(card, grade) {
  const iv = card.iv || 0;
  if (grade === "again") return 1;
  if (grade === "hard") return iv ? Math.max(iv + 1, Math.round(iv * 1.2)) : 1;
  return iv ? Math.max(iv + 1, Math.round(iv * card.ease)) : 3;
}

// grade : "again" | "hard" | "easy". exam : date du Grand Oral, facultative.
export function review(card, grade, now = Date.now(), exam = null) {
  const c = { ...card };
  let iv = Math.min(MAX_DAYS, nextInterval(card, grade));
  const left = daysUntil(exam, now);
  if (left !== null && left > 1) iv = Math.min(iv, left - 1);
  c.iv = iv;
  c.ease = clamp(card.ease + (grade === "easy" ? 0.1 : grade === "hard" ? -0.15 : -0.2), 1.3, 3);
  c.reps = grade === "again" ? 0 : card.reps + 1;
  if (grade === "again" && card.iv) c.lapses = (card.lapses || 0) + 1;
  c.last = now;
  c.due = startOfDay(now) + iv * DAY;
  return c;
}

export const isNew = (c) => !c.last;
export const dueCards = (deck, now = Date.now()) => Object.entries(deck).filter(([, c]) => c.due <= now);

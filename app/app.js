import { newCard, review, nextInterval, isNew, dueCards, daysUntil, GRADES, MAX_DAYS } from "./srs.js";

const KEY = "objectif-grand-oral-v1";
const DAILY_GOAL = 40; // XP par jour (1 XP par carte, 2 si « Facile »)
const root = document.getElementById("app");

// ---------- État ----------
function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
const DEFAULTS = () => ({ deck: {}, xp: 0, streak: 0, lastDay: null, days: {}, newPerDay: 30, scope: "core", exam: null });
const state = Object.assign(DEFAULTS(), load());
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function addXp(n) {
  state.xp += n;
  const t = dayKey();
  state.days[t] = (state.days[t] || 0) + n;
  if (state.lastDay !== t) {
    state.streak = state.lastDay === dayKey(Date.now() - 864e5) ? state.streak + 1 : 1;
    state.lastDay = t;
  }
  save();
}
// Une série non prolongée hier est perdue.
const liveStreak = () => (state.lastDay === dayKey() || state.lastDay === dayKey(Date.now() - 864e5) ? state.streak : 0);

// ---------- Sauvegarde ----------
// La progression ne vit que sur cet appareil : on peut l'exporter dans un fichier et la restaurer ailleurs.
const BACKUP_APP = "objectif-grand-oral";
// Dans l'application iPhone (Capacitor), pas de téléchargement : on écrit le fichier puis on ouvre
// la feuille de partage (Fichiers, AirDrop, e-mail…).
const nativePlugin = (name) => window.Capacitor?.isNativePlatform?.() && (window.Capacitor.Plugins?.[name] || window.Capacitor.registerPlugin?.(name));
async function exportProgress() {
  state.lastBackup = Date.now();
  save();
  const json = JSON.stringify({ app: BACKUP_APP, version: 1, exported: new Date().toISOString(), state });
  const name = `objectif-grand-oral-${dayKey()}.json`;
  const fs = nativePlugin("Filesystem"), share = nativePlugin("Share");
  if (fs && share) {
    try {
      const { uri } = await fs.writeFile({ path: name, data: json, directory: "CACHE", encoding: "utf8" });
      await share.share({ title: "Sauvegarde Objectif Grand Oral", files: [uri] });
    } catch (e) {
      if (!/cancel/i.test(String(e?.message || e))) alert("La sauvegarde n'a pas pu être partagée.");
    }
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const needsBackup = () => Object.keys(state.deck).length >= 30 && (!state.lastBackup || Date.now() - state.lastBackup > 14 * 864e5);
const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
function importProgress(file, after) {
  const r = new FileReader();
  r.onload = () => {
    let d = null;
    try { d = JSON.parse(r.result); } catch {}
    const s = d && d.app === BACKUP_APP && d.state;
    if (!isObj(s) || !isObj(s.deck || {})) return alert("Ce fichier n'est pas une sauvegarde d'Objectif Grand Oral.");
    const when = new Date(d.exported).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    if (!confirm(`Restaurer la sauvegarde du ${when} (${Object.keys(s.deck || {}).length} cartes, ${s.xp || 0} XP) ?\nTa progression actuelle sur cet appareil sera remplacée.`)) return;
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, DEFAULTS(), s);
    save();
    after();
  };
  r.readAsText(file);
}

// ---------- Contenu ----------
// cours.json : 8 parties, 56 fiches (fiche-mémoire + cartes) ; jury.json : 580 questions du jury ;
// q500.json : 500 questions-réponses. Toutes les cartes sont indexées par identifiant dans CARDS.
let PARTS = [], FICHES = [], JURY = [], Q500 = [];
const CARDS = new Map();
const KINDS = {
  ref: "Portée d'une décision", qr: "Angle mort", jury: "Relance du jury", plan: "Plan d'exposé",
  def: "Définition", doct: "Doctrine", texte: "Texte", notion: "Notion",
};
async function loadData() {
  const get = async (f) => (await fetch(`data/${f}.json`)).json();
  const [cours, jury, q500] = await Promise.all([get("cours"), get("jury"), get("q500")]);
  PARTS = cours.parts;
  FICHES = cours.fiches;
  JURY = jury.chapters;
  Q500 = q500.sections;
  const partOf = {};
  for (const p of PARTS) for (const n of p.fiches) partOf[n] = p.id;
  for (const f of FICHES) {
    f.part = partOf[f.n];
    for (const c of f.cards) CARDS.set(c.id, { ...c, src: "cours", fiche: f.n, lv: f.part, label: KINDS[c.k] || "Carte", html: true });
  }
  JURY.forEach((ch, i) => ch.sections.forEach((s) => s.cards.forEach((c) => CARDS.set(c.id, {
    ...c, src: "jury", level: c.lv, lv: "jury", chapter: i, label: `Question du jury · ${c.lv}`, ctx: `${ch.title} · ${s.title} · Q${c.num} · ${c.who}`,
  }))));
  Q500.forEach((s, i) => s.cards.forEach((c) => CARDS.set(c.id, {
    ...c, src: "q500", lv: "q500", section: i, label: "500 questions", ctx: `${s.title} · n° ${c.num}`,
  })));
}

const ficheCards = (f) => f.cards.filter((c) => state.scope === "all" || c.core).map((c) => c.id);
const seen = (id) => state.deck[id] && !isNew(state.deck[id]);
const countSeen = (ids) => ids.filter(seen).length;
const nextFiche = () => FICHES.find((f) => countSeen(ficheCards(f)) < ficheCards(f).length);

// Nouvelles cartes : introduites au rythme choisi dans le profil.
const PACES = [10, 20, 30, 50, 80];
const newSeenToday = () => (state.newDay === dayKey() ? state.newSeen : 0);
function countNew() {
  if (state.newDay !== dayKey()) Object.assign(state, { newDay: dayKey(), newSeen: 0 });
  state.newSeen += 1;
}
function reviewQueue() {
  const due = dueCards(state.deck).filter(([id]) => CARDS.has(id)).sort((a, b) => a[1].due - b[1].due);
  const old = due.filter(([, c]) => !isNew(c)).map(([id]) => id);
  const fresh = due.filter(([, c]) => isNew(c)).map(([id]) => id).slice(0, Math.max(0, state.newPerDay - newSeenToday()));
  return [...old, ...fresh];
}
const waitingNew = () => Object.entries(state.deck).filter(([id, c]) => isNew(c) && CARDS.has(id)).length;
// Temps estimé : environ 30 s pour une nouvelle carte, 15 s par révision, et 4 révisions par carte au début.
const paceMinutes = (n) => Math.round((n * 30 + n * 4 * 15) / 60);
function addToDeck(ids) {
  let n = 0;
  for (const id of ids) if (!state.deck[id]) { state.deck[id] = newCard(); n++; }
  save();
  return n;
}

// ---------- Utilitaires ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const buzz = (p) => navigator.vibrate && navigator.vibrate(p);
const plural = (n, w, ws = `${w}s`) => `${n} ${n > 1 ? ws : w}`;
const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const stripTags = (h) => h.replace(/<[^>]+>/g, "");
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
const fmtDays = (d) => (d <= 1 ? "demain" : d < 30 ? `${d} j` : `${Math.round(d / 30)} mois`);

const ICONS = {
  path: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zM9 3v15M15 6v15",
  cards: "m12 2 10 5-10 5L2 7l10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  flame: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  back: "m12 19-7-7 7-7M19 12H5",
  play: "M7 4v16l13-8L7 4z",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5",
  star: "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1L12 2z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3",
  bulb: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  stop: "M6 6h12v12H6z",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  chevron: "m9 18 6-6-6-6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  scale: "M12 3v18M7 21h10M3 7h18M6 7l-3 7a3 3 0 0 0 6 0L6 7zM18 7l-3 7a3 3 0 0 0 6 0l-3-7z",
  quote: "M3 21c3 0 7-1 7-8V5H3v8h4c0 3-1 5-4 5zM14 21c3 0 7-1 7-8V5h-7v8h4c0 3-1 5-4 5z",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  shuffle: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
  layers: "M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5",
  sparkle: "M12 3l1.9 5.8L20 10.7l-6.1 1.9L12 18.5l-1.9-5.9L4 10.7l6.1-1.9L12 3z",
};
const icon = (n, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n]}"/></svg>`;

function render(html, { nav = null, lv = null } = {}) {
  stopTimer();
  root.innerHTML = `<main id="view" class="enter ${nav ? "" : "no-nav"}">${html}</main>${nav ? tabbar(nav) : ""}`;
  if (lv) root.dataset.lv = lv;
  else delete root.dataset.lv;
  window.scrollTo(0, 0);
  root.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => TABS[b.dataset.tab]()));
}

function tabbar(on) {
  const due = reviewQueue().length;
  const tab = (id, ic, label, extra = "") => `<button class="tab ${on === id ? "on" : ""}" data-tab="${id}">${icon(ic)}${label}${extra}</button>`;
  return `<nav class="tabbar">
    ${tab("home", "path", "Programme")}
    ${tab("bank", "chat", "Questions")}
    ${tab("review", "cards", "Réviser", due ? `<span class="dot">${due > 999 ? "999+" : due}</span>` : "")}
    ${tab("oral", "mic", "Oral")}
    ${tab("profile", "user", "Profil")}
  </nav>`;
}

const examLeft = () => daysUntil(state.exam);
const examPill = () => {
  const d = examLeft();
  return d !== null && d >= 0 ? `<span class="pill exam" title="Avant le Grand Oral">${icon("calendar")}J-${d}</span>` : "";
};
const topbar = () => `
  <header class="topbar">
    <div class="brand"><img class="logo" src="icons/logo-mark.png" alt=""><span class="brand-name">Objectif Grand Oral</span></div>
    <div class="pills">
      ${examPill()}
      <span class="pill" title="Série">${icon("flame", "flame")}${liveStreak()}</span>
      <span class="pill" title="XP">${icon("bolt", "bolt")}${state.xp}</span>
    </div>
  </header>`;

// ---------- Accueil : le programme ----------
function home() {
  const today = state.days[dayKey()] || 0;
  const pct = Math.min(1, today / DAILY_GOAL);
  const C = 2 * Math.PI * 36;
  const due = reviewQueue().length;
  const next = nextFiche();
  const left = examLeft();
  const studied = Object.values(state.deck).filter((c) => !isNew(c)).length;

  render(`
    ${topbar()}
    <section class="hero">
      <div class="hero-top">
        <div class="ring">
          <svg viewBox="0 0 84 84"><circle class="track" cx="42" cy="42" r="36"/>
            <circle class="bar" cx="42" cy="42" r="36" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>
          <span>${Math.round(pct * 100)}%</span>
        </div>
        <div>
          <small>Objectif du jour</small>
          <h2>${pct >= 1 ? "Objectif atteint !" : `${today} / ${DAILY_GOAL} XP`}</h2>
          <p>${pct >= 1 ? "Bravo, ta série continue." : "Se souvenir, plutôt que relire : chaque rappel ancre la notion."}</p>
        </div>
      </div>
      ${left !== null && left >= 0 ? `<div class="countdown">${icon("calendar")}<span><b>J-${left}</b> avant le Grand Oral · ${plural(studied, "carte")} déjà travaillée${studied > 1 ? "s" : ""}</span></div>` : ""}
      ${due ? `<button class="cta-light" id="continue">${icon("cards")}Réviser · ${plural(due, "carte")}</button>`
            : next ? `<button class="cta-light" id="continue">${icon("play")}Étudier · Fiche ${next.n}</button>`
            : `<button class="cta-light" id="continue">${icon("check")}Tout est à jour</button>`}
    </section>
    <button class="tile" data-tab="review">
      <div class="tile-icon ${due ? "" : "calm"}">${icon(due ? "cards" : "check")}</div>
      <div><b>${due ? "Cartes à réviser" : "Révisions à jour"}</b>
        <span>${due ? "L'algorithme les a programmées pour aujourd'hui" : waitingNew() ? `${plural(waitingNew(), "nouvelle carte")} en attente pour les prochains jours` : "Étudie une fiche : ses cartes arriveront ici"}</span></div>
      ${due ? `<span class="badge-count">${due}</span>` : `<span class="go">${icon("chevron")}</span>`}
    </button>
    <button class="tile" data-tab="oral">
      <div class="tile-icon gold">${icon("mic")}</div>
      <div><b>S'entraîner à l'oral</b><span>Questions du jury chronométrées · sujet d'exposé en 1 h + 15 min</span></div>
      <span class="go">${icon("chevron")}</span>
    </button>
    ${left === null ? `<button class="tile" id="set-exam">
      <div class="tile-icon alt">${icon("calendar")}</div>
      <div><b>Date de ton Grand Oral</b><span>Pour le compte à rebours, et pour que chaque carte soit revue avant l'épreuve</span></div>
      <span class="go">${icon("chevron")}</span></button>` : ""}
    ${needsBackup() ? `<button class="tile" id="backup-home">
      <div class="tile-icon save">${icon("download")}</div>
      <div><b>Sauvegarde ta progression</b><span>${state.lastBackup ? "Ta dernière sauvegarde date de plus de 2 semaines" : "Elle n'existe que sur cet appareil : garde-en une copie"}</span></div>
      <span class="go">${icon("chevron")}</span></button>` : ""}
    <div id="path">${pathSection(next)}</div>
  `, { nav: "home" });

  requestAnimationFrame(() => setTimeout(() => {
    const bar = root.querySelector(".ring .bar");
    if (bar) bar.style.strokeDashoffset = C * (1 - pct);
  }, 60));
  root.querySelector("#continue").onclick = () => (due ? session(reviewQueue(), { title: "Révision" }) : next ? fiche(next.n) : reviewTab());
  root.querySelector("#set-exam")?.addEventListener("click", profile);
  root.querySelector("#backup-home")?.addEventListener("click", async () => { await exportProgress(); home(); });
  bindPath(next);
}

// Le programme s'affiche une partie à la fois (onglets I à VIII), fiche par fiche.
let shownPart = null;
function pathSection(next) {
  const cur = (next && PARTS.find((p) => p.fiches.includes(next.n))) || PARTS[PARTS.length - 1];
  const part = PARTS.find((p) => p.id === shownPart) || cur;
  const fichesOf = (p) => p.fiches.map((n) => FICHES.find((f) => f.n === n));
  const doneF = (f) => countSeen(ficheCards(f)) === ficheCards(f).length;
  const tabs = PARTS.map((p) => {
    const full = fichesOf(p).every(doneF);
    return `<button class="lv-tab ${p.id === part.id ? "on" : ""}" data-lv="${p.id}" data-pick="${p.id}">${full ? icon("check") : ""}${p.id}</button>`;
  }).join("");
  const list = fichesOf(part);
  const nDone = list.filter(doneF).length;
  const ids = list.flatMap(ficheCards);
  const rows = list.map((f) => {
    const all = ficheCards(f), k = countSeen(all);
    const st = k === all.length ? "done" : next && next.n === f.n ? "next" : "";
    return `<button class="fiche-row ${st}" data-n="${f.n}">
      <span class="f-num">${st === "done" ? icon("check") : f.n}</span>
      <span class="f-txt"><b>${esc(f.title)}</b><small>${k ? `${k} / ${all.length} cartes étudiées` : `${all.length} cartes`}</small>
        ${k && k < all.length ? `<span class="f-bar"><i style="width:${(k / all.length) * 100}%"></i></span>` : ""}</span>
      <span class="f-arrow">${icon("chevron")}</span></button>`;
  }).join("");
  return `<div class="lv-tabs" role="tablist">${tabs}</div>
    <section class="unit" data-lv="${part.id}">
      <div class="unit-head" data-lv="${part.id}">
        <small>Partie ${part.id} · fiches ${list[0].n} à ${list[list.length - 1].n}</small>
        <h3>${esc(part.title)}</h3>
        <div class="meter"><i style="width:${(countSeen(ids) / ids.length) * 100}%"></i></div>
        <div class="count">${nDone} / ${list.length} fiches · ${countSeen(ids)} / ${ids.length} cartes</div>
      </div>
      <div class="fiches">${rows}</div>
    </section>`;
}
function bindPath(next) {
  const box = root.querySelector("#path");
  box.querySelectorAll(".fiche-row").forEach((b) => (b.onclick = () => fiche(+b.dataset.n)));
  box.querySelectorAll(".lv-tab").forEach((b) => (b.onclick = () => {
    shownPart = b.dataset.pick;
    box.innerHTML = pathSection(next);
    bindPath(next);
    box.querySelector(".lv-tab.on").scrollIntoView({ inline: "center", block: "nearest" });
  }));
}

// ---------- Fiche ----------
const LEGEND = `<div class="legend"><span><i style="background:var(--c-texte)"></i>Textes</span>
  <span><i style="background:var(--c-juris)"></i>Jurisprudence</span><span><i style="background:var(--c-doct)"></i>Doctrine</span>
  <span><b>Gras</b> : à réciter</span></div>`;
function fiche(n, back = home) {
  const f = FICHES.find((x) => x.n === n);
  const ids = ficheCards(f);
  const fresh = ids.filter((id) => !seen(id));
  const queued = fresh.filter((id) => state.deck[id]).length;
  const m = f.memo;
  const list = (items, cls = "") => (items.length ? `<div class="block rich ${cls}"><ul>${items.map((h) => `<li>${h}</li>`).join("")}</ul></div>` : "");
  render(`
    <div class="ex-top"><button class="icon-btn" id="back" aria-label="Retour">${icon("back")}</button></div>
    <section class="fiche-hero" data-n="${f.n}">
      <span class="chip">Partie ${f.part} · Fiche ${f.n}</span>
      <h1>${esc(f.title)}</h1>
      <div class="meta">
        <span>${icon("cards")}${ids.length} cartes</span>
        <span>${icon("check")}${ids.length - fresh.length} étudiées</span>
        ${queued ? `<span>${icon("clock")}${queued} en attente</span>` : ""}
      </div>
    </section>
    ${LEGEND}
    ${m.accroche.length ? `<h4 class="section-title">${icon("quote")}Accroche</h4>${list(m.accroche)}` : ""}
    ${m.definition.length ? `<h4 class="section-title">${icon("bulb")}Définition en trois lignes</h4>${list(m.definition)}` : ""}
    ${m.refs.length ? `<h4 class="section-title">${icon("star")}Les cinq références incontournables</h4>${list(m.refs)}` : ""}
    ${m.plans.length ? `<h4 class="section-title">${icon("layers")}Deux matrices de plan</h4>${list(m.plans.map((h) => h.replace(/ \/ (?=II\.)/, "<br>")))}` : ""}
    ${m.pieges.length ? `<h4 class="section-title">${icon("alert")}Trois pièges</h4>${list(m.pieges, "warn")}` : ""}
    ${f.sujets.length ? `<h4 class="section-title">${icon("target")}Sujets d'exposé rattachables</h4>${list(f.sujets, "plain")}` : ""}
    <h4 class="section-title">${icon("list")}Les cartes de la fiche</h4>
    <details class="allcards"><summary>Voir les ${ids.length} questions et réponses</summary>
      <div class="qa-list">${ids.map((id) => { const c = CARDS.get(id); return `<div class="qa ${seen(id) ? "learned" : ""}"><small>${esc(c.label)}</small><b>${esc(c.q)}</b><div class="rich">${c.a}</div></div>`; }).join("")}</div>
    </details>
    <p class="note">${state.scope === "all" ? "Toutes les cartes du dossier détaillé sont incluses." : "Cartes essentielles : fiche-mémoire, relances du jury et angles morts. Le dossier détaillé s'ajoute dans Profil → Cartes par fiche."}</p>
    <div class="dock">
      ${fresh.length ? `<button class="btn lv" id="study">${icon("play")}Étudier maintenant · ${plural(fresh.length, "carte")}</button>
        ${queued < fresh.length ? `<button class="btn ghost small" id="queue">${icon("plus")}Ajouter à mes révisions (${state.newPerDay} nouvelles / jour)</button>` : ""}`
        : `<button class="btn lv" id="again">${icon("cards")}Revoir toute la fiche</button>`}
    </div>
  `, { lv: f.part });
  root.querySelector("#back").onclick = back;
  root.querySelector("#study")?.addEventListener("click", () => {
    addToDeck(fresh);
    session(fresh, { title: `Fiche ${f.n}`, back: () => fiche(n, back) });
  });
  root.querySelector("#queue")?.addEventListener("click", () => {
    const k = addToDeck(fresh);
    buzz(15);
    alert(`${plural(k, "carte ajoutée", "cartes ajoutées")} : elles arriveront dans tes révisions au rythme de ${state.newPerDay} nouvelles par jour.`);
    fiche(n, back);
  });
  // Revoir toute la fiche : séance d'entraînement qui ne modifie pas le calendrier des cartes.
  root.querySelector("#again")?.addEventListener("click", () => session(shuffle(ids), { title: `Fiche ${f.n}`, back: () => fiche(n, back), practice: true }));
}

// ---------- Séance de révision ----------
// Une carte « Oublié » est reprogrammée à demain, mais revient aussi plus tard dans la séance
// (après quelques autres cartes) jusqu'à ce qu'elle soit retrouvée : cette répétition ne change plus son calendrier.
const RELEARN_GAP = 4;
let timer = null;
const stopTimer = () => { clearInterval(timer); timer = null; };

function session(ids, opts = {}) {
  const s = { queue: [...ids], relearn: new Set(), total: ids.length, done: 0, stats: { again: 0, hard: 0, easy: 0 }, xp: 0, ...opts };
  if (!s.queue.length) return reviewTab();
  showCard(s);
}
function cardHtml(c, revealed) {
  const answer = c.html ? `<div class="card-a html rich">${c.a}</div>` : `<div class="card-a">${esc(c.a)}</div>`;
  return `<article class="card" data-lv="${c.lv}">
      <span class="card-kind">${esc(c.label)}</span>
      <div class="card-ctx">${esc(c.ctx || "")}</div>
      <h2 class="card-q">${esc(c.q)}</h2>
      ${revealed ? `${answer}
        ${c.cite ? `<div class="card-cite"><small>À citer</small>${esc(c.cite)}</div>` : ""}
        ${c.upd ? `<span class="card-upd">Mis à jour ${esc(c.upd)} · à revérifier la veille</span>` : ""}`
      : `<div class="think">${icon("bulb")}Réponds à voix haute ou dans ta tête, puis vérifie.</div>`}
    </article>`;
}
function showCard(s) {
  const id = s.queue[0];
  const c = CARDS.get(id);
  const again = s.relearn.has(id);
  const pct = (s.done / (s.total + s.relearn.size || 1)) * 100;
  const left = s.queue.length;
  render(`
    <div class="ex-top">
      <button class="icon-btn" id="quit" aria-label="Quitter">${icon("x")}</button>
      <div class="progress" data-lv="${c.lv}"><i style="width:${pct}%"></i></div>
      <span class="pill">${icon("cards")}${left}</span>
    </div>
    ${s.timed ? `<div class="sim"><small>Temps de réponse</small><div class="clock" id="clock">${mmss(s.timed)}</div></div>` : ""}
    <div id="card">${cardHtml(c, false)}</div>
    ${again ? `<p class="relearn">${icon("alert")} Carte oubliée tout à l'heure : retrouve-la avant la fin de la séance.</p>` : ""}
    <div class="dock"><div id="actions"><button class="btn lv" id="reveal">${icon("eye")}Afficher la réponse</button></div></div>
  `, { lv: c.lv });
  root.querySelector("#quit").onclick = () => endSession(s, true);
  if (s.timed) {
    let t = s.timed;
    timer = setInterval(() => {
      t -= 1;
      const el = root.querySelector("#clock");
      if (!el) return stopTimer();
      el.textContent = mmss(Math.abs(t));
      if (t === 0) { el.classList.add("over"); buzz([40, 60, 40]); }
    }, 1000);
  }
  root.querySelector("#reveal").onclick = () => {
    stopTimer();
    buzz(10);
    root.querySelector("#card").innerHTML = cardHtml(c, true);
    const deckCard = state.deck[id] || newCard();
    const pick = (g) => (again || s.practice ? "" : fmtDays(Math.min(MAX_DAYS, nextInterval(deckCard, g))));
    root.querySelector("#actions").innerHTML = `<div class="grades">${GRADES.map(([g, label]) =>
      `<button class="grade g-${g}" data-g="${g}">${label}<small>${pick(g) || (g === "again" ? "à revoir" : "retrouvée")}</small></button>`).join("")}</div>`;
    root.querySelectorAll(".grade").forEach((b) => (b.onclick = () => grade(s, id, b.dataset.g)));
  };
}
function grade(s, id, g) {
  s.queue.shift();
  if (s.relearn.has(id) || s.practice) {
    // Répétition dans la séance : le calendrier de la carte ne bouge pas.
    if (g === "again") s.queue.splice(Math.min(RELEARN_GAP, s.queue.length), 0, id);
    else { s.relearn.delete(id); s.done++; }
    if (s.practice) s.stats[g]++;
  } else {
    const before = state.deck[id] || newCard();
    if (isNew(before)) countNew();
    state.deck[id] = review(before, g, Date.now(), state.exam);
    s.stats[g]++;
    if (g === "again") {
      s.relearn.add(id);
      s.queue.splice(Math.min(RELEARN_GAP, s.queue.length), 0, id);
    } else s.done++;
  }
  const xp = g === "easy" ? 2 : 1;
  s.xp += xp;
  addXp(xp);
  if (!s.queue.length) return endSession(s);
  showCard(s);
}
function endSession(s, quit = false) {
  stopTimer();
  const n = s.stats.again + s.stats.hard + s.stats.easy;
  if (!n) return (s.back || reviewTab)();
  const stat = (v, l, c) => `<div class="stat" style="--c:${c}"><b>${v}</b><span>${l}</span></div>`;
  render(`
    <section class="done-screen">
      <div class="trophy">${icon("trophy")}</div>
      <h1>${quit ? "Séance interrompue" : "Séance terminée !"}</h1>
      <p>${esc(s.title || "Révision")} · ${plural(n, "réponse")} · +${s.xp} XP</p>
      <div class="stats">
        ${stat(s.stats.easy, "Faciles", "var(--ok)")}
        ${stat(s.stats.hard, "Difficiles", "var(--hard)")}
        ${stat(s.stats.again, "Oubliées", "var(--ko)")}
      </div>
      <p class="note">${s.practice ? "Séance d'entraînement : le calendrier de tes cartes n'a pas changé." : "Chaque carte a reçu sa prochaine date de révision : demain si elle a été oubliée, plus tard si elle était acquise."}</p>
    </section>
    <div class="dock"><button class="btn" id="next">${icon("check")}Continuer</button></div>
  `);
  root.querySelector("#next").onclick = s.back || home;
}

function reviewTab() {
  const queue = reviewQueue();
  const total = Object.keys(state.deck).length;
  const waiting = waitingNew();
  const fresh = queue.filter((id) => isNew(state.deck[id])).length;
  if (!queue.length) {
    const next = nextFiche();
    render(`
      ${topbar()}
      <div class="screen-title"><h1>Réviser</h1></div>
      <div class="empty">
        <div class="tile-icon calm">${icon("check")}</div>
        <h2>${total ? "Tout est révisé pour aujourd'hui" : "Aucune carte pour l'instant"}</h2>
        <p>${total ? `${plural(total, "carte")} dans ton paquet${waiting ? `, dont ${waiting} nouvelle${waiting > 1 ? "s" : ""} qui arriveront les prochains jours` : ""}. Reviens demain : l'algorithme te présentera les cartes au bon moment.` : "Ouvre une fiche du programme et étudie ses cartes : elles reviendront ici au bon moment."}</p>
      </div>
      ${next ? `<button class="btn" id="go">${icon("play")}Étudier la fiche ${next.n}</button>` : ""}
    `, { nav: "review" });
    root.querySelector("#go")?.addEventListener("click", () => fiche(next.n, reviewTab));
    return;
  }
  render(`
    ${topbar()}
    <div class="screen-title"><h1>Réviser</h1></div>
    <div class="empty">
      <div class="tile-icon">${icon("cards")}</div>
      <h2>${plural(queue.length, "carte")} aujourd'hui</h2>
      <p>${queue.length - fresh} à revoir · ${fresh} nouvelle${fresh > 1 ? "s" : ""} · environ ${Math.max(1, Math.round(((queue.length - fresh) * 15 + fresh * 30) / 60))} min</p>
    </div>
    <div class="algo">
      <p>Pour chaque question, cherche la réponse <b>avant</b> de la regarder, puis dis honnêtement si tu t'en souvenais :</p>
      <ul>
        <li><b class="g-easy">Facile</b>intervalle multiplié (3 j → 8 j)</li>
        <li><b class="g-hard">Difficile</b>intervalle un peu allongé (3 j → 4 j)</li>
        <li><b class="g-again">Oublié</b>la carte revient demain</li>
      </ul>
    </div>
    <div class="dock"><button class="btn" id="go">${icon("play")}Commencer</button></div>
  `, { nav: "review" });
  root.querySelector("#go").onclick = () => session(queue, { title: "Révision", back: home });
}

// ---------- Questions : jury, 500 questions, recherche ----------
let bankView = "jury";
let lvFilter = null;
function bankTabs() {
  const chip = (id, label) => `<button class="fchip ${bankView === id ? "on" : ""}" data-view="${id}">${label}</button>`;
  return `<div class="chips">${chip("jury", "Jury · 580")}${chip("q500", "500 questions")}${chip("search", `${icon("search")} Rechercher`)}</div>`;
}
function bindBankTabs() {
  root.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => { bankView = b.dataset.view; bank(); }));
}
function bank() {
  if (bankView === "search") return searchView();
  const groups = bankView === "jury"
    ? JURY.map((ch, i) => ({ i, title: ch.title, ids: ch.sections.flatMap((s) => s.cards.map((c) => c.id)) }))
    : Q500.map((s, i) => ({ i, title: s.title, ids: s.cards.map((c) => c.id) }));
  const rows = groups.map((g) => `<button class="bank-row" data-lv="${bankView}" data-i="${g.i}">
      <span class="f-num">${bankView === "jury" ? g.i + 1 : g.ids.length}</span>
      <span class="f-txt"><b>${esc(g.title)}</b><small>${plural(g.ids.length, "question")} · ${countSeen(g.ids)} étudiée${countSeen(g.ids) > 1 ? "s" : ""}</small></span>
      <span class="f-arrow">${icon("chevron")}</span></button>`).join("");
  render(`
    ${topbar()}
    <div class="screen-title"><h1>Questions</h1></div>
    ${bankTabs()}
    <p class="lead">${bankView === "jury"
      ? "Banque de 580 questions du jury (IEJ de Toulouse, état du droit au 3 octobre 2026) avec éléments de réponse et références à citer."
      : "Fiche 500 questions-réponses (PréBarreau, éd. 2025). Les réponses datées (personnalités, chiffres) sont remplacées par la mise à jour du 22 octobre 2026."}</p>
    <div class="bank-list">${rows}</div>
  `, { nav: "bank" });
  bindBankTabs();
  root.querySelectorAll(".bank-row").forEach((b) => (b.onclick = () => (bankView === "jury" ? juryChapter(+b.dataset.i) : q500Section(+b.dataset.i))));
}

function qrow(id) {
  const c = CARDS.get(id);
  const inDeck = Boolean(state.deck[id]);
  return `<div class="qrow" data-id="${id}">
    <div class="qrow-head">
      <div><small>${c.src === "jury" ? `<span class="lvtag ${c.level}">${c.level}</span>Q${c.num} · ${esc(c.who)}` : c.src === "q500" ? `n° ${c.num}` : esc(c.label)}</small>
        <b>${esc(c.q)}</b></div>
      <button class="add ${inDeck ? "on" : ""}" aria-label="${inDeck ? "Dans mes révisions" : "Ajouter à mes révisions"}">${icon(inDeck ? "check" : "plus")}</button>
    </div>
  </div>`;
}
function bindRows(box) {
  box.querySelectorAll(".qrow").forEach((row) => {
    const id = row.dataset.id;
    row.querySelector(".add").onclick = (e) => {
      e.stopPropagation();
      if (state.deck[id]) {
        if (!isNew(state.deck[id]) && !confirm("Retirer cette carte de tes révisions ? Son historique sera perdu.")) return;
        delete state.deck[id];
      } else state.deck[id] = newCard();
      save();
      buzz(10);
      const b = row.querySelector(".add");
      b.classList.toggle("on", Boolean(state.deck[id]));
      b.innerHTML = icon(state.deck[id] ? "check" : "plus");
    };
    row.querySelector(".qrow-head > div").onclick = () => {
      const open = row.querySelector(".card-a");
      if (open) { row.querySelectorAll(".card-a, .card-cite, .card-upd").forEach((x) => x.remove()); return; }
      const c = CARDS.get(id);
      row.insertAdjacentHTML("beforeend", (c.html ? `<div class="card-a html rich">${c.a}</div>` : `<div class="card-a">${esc(c.a)}</div>`)
        + (c.cite ? `<div class="card-cite"><small>À citer</small>${esc(c.cite)}</div>` : "")
        + (c.upd ? `<span class="card-upd">Mis à jour ${esc(c.upd)}</span>` : ""));
    };
  });
}
function groupScreen({ title, sub, lv, sections, back, extra = "" }) {
  const ids = sections.flatMap((s) => s.ids);
  const fresh = ids.filter((id) => !seen(id));
  render(`
    <div class="ex-top"><button class="icon-btn" id="back" aria-label="Retour">${icon("back")}</button></div>
    <section class="fiche-hero" data-n="">
      <span class="chip">${esc(sub)}</span>
      <h1>${esc(title)}</h1>
      <div class="meta"><span>${icon("chat")}${plural(ids.length, "question")}</span><span>${icon("check")}${ids.length - fresh.length} étudiées</span></div>
    </section>
    ${extra}
    <p class="note">Touche une question pour voir la réponse, ${icon("plus")} pour l'ajouter à tes révisions.</p>
    <div id="rows">${sections.map((s) => `${s.title ? `<h4 class="section-title">${esc(s.title)}</h4>` : ""}
      <div class="bank-list">${s.ids.map(qrow).join("")}</div>`).join("")}</div>
    ${fresh.length ? `<div class="dock"><button class="btn lv" id="study">${icon("play")}Étudier ${plural(fresh.length, "question")}</button></div>` : ""}
  `, { lv });
  root.querySelector("#back").onclick = back;
  bindRows(root.querySelector("#rows"));
  root.querySelector("#study")?.addEventListener("click", () => {
    addToDeck(fresh);
    session(fresh, { title, back });
  });
}
function juryChapter(i) {
  const ch = JURY[i];
  const keep = (c) => !lvFilter || c.lv === lvFilter;
  const chip = (v, l) => `<button class="fchip ${lvFilter === v ? "on" : ""}" data-f="${v || ""}">${l}</button>`;
  groupScreen({
    title: ch.title, sub: `Chapitre ${i + 1} · Banque du jury`, lv: "jury", back: bank,
    extra: `<div class="chips">${chip(null, "Tous niveaux")}${chip("Base", "Base")}${chip("Approfondi", "Approfondi")}${chip("Piège", "Piège")}</div>`,
    sections: ch.sections.map((s) => ({ title: s.title, ids: s.cards.filter(keep).map((c) => c.id) })).filter((s) => s.ids.length),
  });
  root.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { lvFilter = b.dataset.f || null; juryChapter(i); }));
}
function q500Section(i) {
  const s = Q500[i];
  groupScreen({ title: s.title, sub: "500 questions · PréBarreau", lv: "q500", back: bank, sections: [{ title: "", ids: s.cards.map((c) => c.id) }] });
}

let searchText = "";
let searchIndex = null;
function searchView() {
  render(`
    ${topbar()}
    <div class="screen-title"><h1>Questions</h1></div>
    ${bankTabs()}
    <label class="searchbox">${icon("search")}<input id="q" type="search" placeholder="Garde à vue, Benjamin, laïcité…" value="${esc(searchText)}" autocomplete="off"></label>
    <div id="results"></div>
  `, { nav: "bank" });
  bindBankTabs();
  const input = root.querySelector("#q");
  const run = () => {
    searchText = input.value;
    const box = root.querySelector("#results");
    const words = fold(searchText).split(/\s+/).filter((w) => w.length > 1);
    if (!words.length) { box.innerHTML = `<p class="lead" style="margin-top:14px">Cherche dans les ${CARDS.size.toLocaleString("fr-FR")} cartes : cours, questions du jury et 500 questions.</p>`; return; }
    searchIndex ||= [...CARDS.values()].map((c) => [c.id, fold(c.q), fold(stripTags(c.a) + " " + (c.cite || "") + " " + (c.ctx || ""))]);
    const scored = [];
    for (const [id, q, a] of searchIndex) {
      if (!words.every((w) => q.includes(w) || a.includes(w))) continue;
      scored.push([words.filter((w) => q.includes(w)).length * 10 - q.length / 100, id]);
    }
    scored.sort((x, y) => y[0] - x[0]);
    box.innerHTML = scored.length
      ? `<p class="note">${plural(scored.length, "résultat")}${scored.length > 80 ? " (80 premiers)" : ""}</p><div class="bank-list">${scored.slice(0, 80).map(([, id]) => qrow(id)).join("")}</div>`
      : `<p class="lead" style="margin-top:14px">Aucune carte ne contient « ${esc(searchText)} ».</p>`;
    bindRows(box);
  };
  input.oninput = run;
  run();
  if (!searchText) input.focus();
}

// ---------- Oral : questions du jury chronométrées, sujet d'exposé ----------
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const SIM = {
  prep: { title: "Préparation", total: 60 * 60, steps: [
    [0, "Comprendre le sujet", "Définir chaque terme, délimiter le sujet, repérer la liberté en cause et la tension qui le traverse."],
    [10 * 60, "Mobiliser la matière", "Textes (Constitution, Convention, code), jurisprudence, doctrine, actualité datée : ce que tu citeras."],
    [25 * 60, "Problématique et plan", "Une question à laquelle on peut répondre ; deux parties étanches, chaque sous-partie en une phrase affirmative."],
    [40 * 60, "Rédiger l'essentiel", "Introduction et conclusion rédigées, le reste en mots-clés ; les transitions écrites en entier."],
    [55 * 60, "Relire et minuter", "Vérifier que le contrôle de proportionnalité et un exemple d'actualité figurent quelque part."],
  ] },
  talk: { title: "Exposé", total: 15 * 60, steps: [
    [0, "Introduction (4 min au plus)", "Formule d'appel, accroche, définitions, enjeu, problématique, annonce du plan."],
    [4 * 60, "Première partie", "Parties équilibrées à trente secondes près."],
    [8 * 60 + 30, "Seconde partie", "Garder le fil de la problématique ; transition annoncée."],
    [13 * 60, "Conclusion (2 min)", "Réponse à la problématique, ouverture. « Je suis à votre disposition pour vos questions. »"],
  ] },
};
const allSubjects = () => FICHES.flatMap((f) => [
  ...f.memo.plans.map((h) => ({ f, text: (stripTags(h).match(/«(.+?)»/) || [])[1] })),
  ...f.sujets.map((h) => ({ f, text: stripTags(h).replace(/^«\s*|\s*».*$/g, "").replace(/\s—\s.*$/, "") })),
]).filter((s) => s.text && s.text.length > 4);

function oral() {
  render(`
    ${topbar()}
    <div class="screen-title"><h1>S'entraîner</h1></div>
    <p class="lead">L'épreuve : <b>1 h</b> de préparation, puis <b>15 min</b> d'exposé et <b>30 min</b> d'entretien avec le jury (coefficient 4).</p>
    <button class="tile" id="jury10">
      <div class="tile-icon gold">${icon("chat")}</div>
      <div><b>Entretien express</b><span>10 questions du jury au hasard, 1 minute chacune pour répondre à voix haute</span></div>
      <span class="go">${icon("chevron")}</span></button>
    <button class="tile" id="pieges">
      <div class="tile-icon">${icon("alert")}</div>
      <div><b>Questions pièges</b><span>10 questions « Piège » de la banque du jury</span></div>
      <span class="go">${icon("chevron")}</span></button>
    <button class="tile" id="subject">
      <div class="tile-icon alt">${icon("shuffle")}</div>
      <div><b>Tirer un sujet d'exposé</b><span>Parmi les ${allSubjects().length} sujets des fiches · préparation 1 h puis exposé 15 min</span></div>
      <span class="go">${icon("chevron")}</span></button>
    <p class="note">Les réponses de l'entretien express rejoignent tes révisions avec leur note : une question ratée reviendra demain.</p>
  `, { nav: "oral" });
  const pick = (filter) => shuffle(JURY.flatMap((ch) => ch.sections.flatMap((s) => s.cards)).filter(filter)).slice(0, 10).map((c) => c.id);
  const start = (ids, title) => { addToDeck(ids); session(ids, { title, back: oral, timed: 60 }); };
  root.querySelector("#jury10").onclick = () => start(pick(() => true), "Entretien express");
  root.querySelector("#pieges").onclick = () => start(pick((c) => c.lv === "Piège"), "Questions pièges");
  root.querySelector("#subject").onclick = () => subject();
}

function subject(sub = null) {
  const list = allSubjects();
  sub ||= list[Math.floor(Math.random() * list.length)];
  render(`
    <div class="ex-top"><button class="icon-btn" id="back" aria-label="Retour">${icon("back")}</button></div>
    <div class="subject"><small>Sujet tiré · Fiche ${sub.f.n} · ${esc(sub.f.title)}</small>${esc(sub.text)}</div>
    <div class="row-btns">
      <button class="btn ghost small" id="other">${icon("shuffle")}Autre sujet</button>
      <button class="btn ghost small" id="see">${icon("book")}Ouvrir la fiche</button>
    </div>
    <div class="dock"><button class="btn" id="go">${icon("clock")}Lancer la préparation (1 h)</button></div>
  `, { lv: sub.f.part });
  root.querySelector("#back").onclick = oral;
  root.querySelector("#other").onclick = () => subject();
  root.querySelector("#see").onclick = () => fiche(sub.f.n, () => subject(sub));
  root.querySelector("#go").onclick = () => simulation("prep", sub);
}

let recorder = null, chunks = [];
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.start();
    return true;
  } catch {
    return false;
  }
}
function stopRecording() {
  return new Promise((res) => {
    if (!recorder || recorder.state === "inactive") return res(null);
    recorder.onstop = () => { recorder.stream.getTracks().forEach((t) => t.stop()); res(URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }))); };
    recorder.stop();
  });
}

function simulation(phase, sub) {
  const P = SIM[phase];
  let t = P.total;
  const canRec = phase === "talk" && "MediaRecorder" in window && navigator.mediaDevices;
  const stepsHtml = () => P.steps.map(([at, title], i) => {
    const elapsed = P.total - t;
    const on = elapsed >= at && (i === P.steps.length - 1 || elapsed < P.steps[i + 1][0]);
    return `<li class="${on ? "on" : ""}"><span>${mmss(at)}</span>${esc(title)}</li>`;
  }).join("");
  const current = () => { const e = P.total - t; return [...P.steps].reverse().find(([at]) => e >= at); };
  render(`
    <div class="ex-top"><button class="icon-btn" id="back" aria-label="Arrêter">${icon("x")}</button></div>
    <div class="subject"><small>${P.title} · Fiche ${sub.f.n}</small>${esc(sub.text)}</div>
    <div class="sim"><small>Temps restant</small><div class="clock" id="clock">${mmss(t)}</div></div>
    <div class="block plain" id="now"></div>
    <ul class="steps" id="steps">${stepsHtml()}</ul>
    ${canRec ? `<label class="note" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="rec"> M'enregistrer pour me réécouter (reste sur l'appareil)</label>` : ""}
    <div class="dock"><button class="btn" id="go">${icon("play")}Démarrer</button></div>
  `, { lv: sub.f.part });
  const now = root.querySelector("#now");
  const paint = () => { const [, title, txt] = current(); now.innerHTML = `<b>${esc(title)}</b><br><span class="muted">${esc(txt)}</span>`; };
  paint();
  root.querySelector("#back").onclick = async () => { stopTimer(); await stopRecording(); subject(sub); };
  const go = root.querySelector("#go");
  go.onclick = async () => {
    if (timer) {
      stopTimer();
      return finishPhase();
    }
    if (root.querySelector("#rec")?.checked && !(await startRecording())) alert("Le micro n'est pas accessible : l'exposé ne sera pas enregistré.");
    go.innerHTML = `${icon("stop")}${phase === "prep" ? "J'ai fini de préparer" : "J'ai terminé mon exposé"}`;
    timer = setInterval(() => {
      t -= 1;
      const el = root.querySelector("#clock");
      if (!el) return stopTimer();
      el.textContent = (t < 0 ? "+" : "") + mmss(Math.abs(t));
      el.classList.toggle("over", t < 0);
      if (t === 0) buzz([60, 80, 60]);
      root.querySelector("#steps").innerHTML = stepsHtml();
      paint();
    }, 1000);
  };
  const finishPhase = async () => {
    const used = P.total - t;
    if (phase === "prep") return simulation("talk", sub);
    const audio = await stopRecording();
    addXp(5);
    const plans = sub.f.memo.plans;
    render(`
      <section class="done-screen">
        <div class="trophy">${icon("mic")}</div>
        <h1>Exposé terminé</h1>
        <p>${mmss(used)} · ${used < 10 * 60 ? "en dessous de 10 minutes : le traitement paraîtra superficiel." : used > 15 * 60 ? "au-delà de 15 minutes : le jury peut t'interrompre." : "dans la fourchette attendue (10 à 15 minutes)."}</p>
      </section>
      ${audio ? `<audio id="playback" controls src="${audio}"></audio>` : ""}
      ${plans.length ? `<h4 class="section-title">${icon("layers")}Les plans proposés par la fiche ${sub.f.n}</h4>
        <div class="block rich"><ul>${plans.map((h) => `<li>${h.replace(/ \/ (?=II\.)/, "<br>")}</li>`).join("")}</ul></div>` : ""}
      <div class="dock"><button class="btn" id="jury">${icon("chat")}Enchaîner sur l'entretien (10 questions)</button>
        <button class="btn ghost small" id="end">Terminer</button></div>
    `, { lv: sub.f.part });
    root.querySelector("#end").onclick = oral;
    root.querySelector("#jury").onclick = () => {
      // Entretien : d'abord les relances du jury de la fiche, puis la banque du jury.
      const own = sub.f.cards.filter((c) => c.k === "jury" || c.k === "qr").map((c) => c.id);
      const ids = [...shuffle(own).slice(0, 5), ...shuffle(JURY.flatMap((ch) => ch.sections.flatMap((s) => s.cards.map((c) => c.id)))).slice(0, 10)].slice(0, 10);
      addToDeck(ids);
      session(ids, { title: "Entretien avec le jury", back: oral, timed: 60 });
    };
  };
}

// ---------- Profil ----------
function profile() {
  const cards = Object.entries(state.deck).filter(([id]) => CARDS.has(id)).map(([, c]) => c);
  const studied = cards.filter((c) => !isNew(c));
  const mastered = studied.filter((c) => c.iv >= 21).length;
  const totalScope = FICHES.reduce((n, f) => n + ficheCards(f).length, 0);
  const kpi = (ic, c, v, label) => `<div class="kpi"><div class="ico" style="--c:${c}">${icon(ic)}</div><b>${v}</b><span>${label}</span></div>`;
  const waiting = waitingNew();
  const left = examLeft();
  render(`
    ${topbar()}
    <div class="profile-head">
      <div class="avatar">${left !== null && left >= 0 ? `J-${left}` : "GO"}</div>
      <div><h1>Ma préparation</h1><p>${left !== null && left >= 0 ? `Grand Oral le ${new Date(state.exam + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}` : "Libertés et droits fondamentaux"}</p></div>
    </div>
    <h4 class="section-title">${icon("calendar")}Date du Grand Oral</h4>
    <div class="date-row"><input type="date" id="exam" value="${state.exam || ""}">${state.exam ? `<button class="icon-btn" id="noexam" aria-label="Effacer">${icon("x")}</button>` : ""}</div>
    <p class="note">Aucune carte ne sera programmée après la veille de l'épreuve : tout ce que tu as appris sera revu au moins une fois avant.</p>
    <h4 class="section-title">${icon("cards")}Nouvelles cartes par jour</h4>
    <div class="opts">${PACES.map((n) => `<button class="opt ${n === state.newPerDay ? "on" : ""}" data-pace="${n}"><b>${n}</b><span>≈ ${paceMinutes(n)} min/j</span></button>`).join("")}</div>
    <p class="note">${waiting ? `${plural(waiting, "nouvelle carte")} en attente : environ ${plural(Math.ceil(waiting / state.newPerDay), "jour")} à ce rythme. ` : ""}Temps estimé par jour une fois le rythme installé. Le bouton « Étudier maintenant » d'une fiche ignore cette limite.</p>
    <h4 class="section-title">${icon("layers")}Cartes par fiche</h4>
    <div class="opts two">
      <button class="opt ${state.scope === "core" ? "on" : ""}" data-scope="core"><b>Essentiel</b><span>${FICHES.reduce((n, f) => n + f.cards.filter((c) => c.core).length, 0)} cartes · fiche-mémoire, jury, angles morts</span></button>
      <button class="opt ${state.scope === "all" ? "on" : ""}" data-scope="all"><b>Complet</b><span>${FICHES.reduce((n, f) => n + f.cards.length, 0)} cartes · avec le dossier détaillé</span></button>
    </div>
    <div class="grid2" style="margin-top:22px">
      ${kpi("flame", "#ff7a1a", liveStreak(), "Jours de série")}
      ${kpi("bolt", "#d4a017", state.xp, "XP au total")}
      ${kpi("cards", "#23357a", `${studied.length}`, `Cartes étudiées`)}
      ${kpi("star", "#12b886", mastered, "Acquises (≥ 21 j)")}
    </div>
    <h4 class="section-title">${icon("target")}Le programme</h4>
    <div class="levels">${PARTS.map((p) => {
      const ids = p.fiches.flatMap((n) => ficheCards(FICHES.find((f) => f.n === n)));
      const k = countSeen(ids);
      return `<div class="lvrow" data-lv="${p.id}"><span class="cefr">${p.id}</span>
        <div><b>${esc(p.title)}</b><div class="meter"><i style="width:${(k / ids.length) * 100}%"></i></div></div><em>${k}/${ids.length}</em></div>`;
    }).join("")}
      <div class="lvrow" data-lv="jury"><span class="cefr">Jury</span><div><b>Banque de questions du jury</b></div><em>${countSeen(JURY.flatMap((ch) => ch.sections.flatMap((s) => s.cards.map((c) => c.id))))}/580</em></div>
    </div>
    <p class="note">Programme : ${totalScope} cartes ${state.scope === "all" ? "(complet)" : "(essentiel)"}.</p>
    <h4 class="section-title">${icon("bulb")}Comment l'algorithme décide</h4>
    <div class="algo">
      <p>Après chaque question, tu dis si tu t'en souvenais. L'application calcule la date de la prochaine révision :</p>
      <ul>
        <li><b class="g-easy">Facile</b>l'intervalle est multiplié par la facilité de la carte (2,5 au départ) : 3 j → 8 j → 20 j…</li>
        <li><b class="g-hard">Difficile</b>l'intervalle augmente peu (× 1,2, au moins un jour de plus) : 3 j → 4 j.</li>
        <li><b class="g-again">Oublié</b>la carte retombe à 1 jour, et revient aussi plus tard dans la séance.</li>
      </ul>
      <p class="note" style="margin:10px 0 0">Première rencontre : Facile → 3 jours, sinon demain. Chaque « Difficile » ou « Oublié » rend la carte un peu moins « facile », chaque « Facile » un peu plus ; intervalle maximal : ${MAX_DAYS} jours.</p>
    </div>
    <h4 class="section-title">${icon("download")}Sauvegarde</h4>
    <div class="backup">
      <p>Ta progression est enregistrée <b>sur cet appareil uniquement</b>. Télécharge une sauvegarde pour la retrouver sur un autre appareil.</p>
      <p class="muted small">${state.lastBackup ? `Dernière sauvegarde : ${new Date(state.lastBackup).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : "Aucune sauvegarde pour l'instant."}</p>
      <div class="backup-btns">
        <button class="btn small" id="export">${icon("download")}Télécharger</button>
        <button class="btn ghost small" id="import">${icon("upload")}Restaurer</button>
        <input type="file" id="import-file" accept=".json,application/json" hidden>
      </div>
    </div>
    <p class="sources">Sources : fascicule Objectif Barreau « Libertés publiques et droits fondamentaux » 2026 et fiches de révision par partie ; banque de questions du jury (IEJ de Toulouse, oct. 2026) ; fiche 500 questions-réponses PréBarreau 2025 et sa mise à jour d'octobre 2026. Les noms des titulaires de fonctions et les chiffres sont à revérifier la veille de l'épreuve.</p>
    <button class="link-danger" id="reset">Réinitialiser ma progression</button>
  `, { nav: "profile" });
  const keepScroll = () => { const y = window.scrollY; profile(); window.scrollTo(0, y); };
  root.querySelector("#exam").onchange = (e) => { state.exam = e.target.value || null; save(); keepScroll(); };
  root.querySelector("#noexam")?.addEventListener("click", () => { state.exam = null; save(); keepScroll(); });
  root.querySelectorAll("[data-pace]").forEach((b) => (b.onclick = () => { state.newPerDay = +b.dataset.pace; save(); buzz(15); keepScroll(); }));
  root.querySelectorAll("[data-scope]").forEach((b) => (b.onclick = () => { state.scope = b.dataset.scope; save(); buzz(15); keepScroll(); }));
  root.querySelector("#export").onclick = async () => { await exportProgress(); profile(); };
  const file = root.querySelector("#import-file");
  root.querySelector("#import").onclick = () => file.click();
  file.onchange = () => file.files[0] && importProgress(file.files[0], home);
  root.querySelector("#reset").onclick = () => {
    if (!confirm("Effacer toute ta progression (cartes, XP, série) ?")) return;
    Object.assign(state, { deck: {}, xp: 0, streak: 0, lastDay: null, days: {}, newDay: null, newSeen: 0 });
    save();
    home();
  };
}

const TABS = { home, bank, review: reviewTab, oral, profile };
loadData()
  .then(home)
  .catch(() => { root.innerHTML = `<main id="view"><div class="empty"><h2>Contenu introuvable</h2><p>Les fichiers de cartes (data/) n'ont pas pu être chargés. Lance l'application depuis un serveur local : <code>cd app && python3 -m http.server 8000</code>.</p></div></main>`; });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

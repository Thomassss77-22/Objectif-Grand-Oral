// Chargement du contenu.
// - Application seule, ou site « ouvert » : les fichiers sont lus à côté de l'application, comme avant.
// - Site avec comptes : le contenu vient du coffre privé, que le serveur ne livre qu'aux comptes
//   ayant acheté le module. Le code de l'application reste public ; sans contenu, il ne sert à rien.
export const MODULE = "grand-oral";
let C = null;
try { C = await import("../compte/compte.js"); } catch {}
export const verrou = !!(C && C.actif);
export const compte = verrou ? C : null;

export async function texte(chemin) {
  if (verrou) return C.contenu(MODULE, chemin);
  const r = await fetch(chemin);
  if (!r.ok) throw new Error("fetch " + chemin);
  return r.text();
}
export const json = async (chemin) => JSON.parse(await texte(chemin));

// Un module JavaScript de contenu, et les modules qu'il importe lui-même, chargés de la même façon.
const urls = new Map();
function urlDe(chemin) {
  if (!urls.has(chemin)) urls.set(chemin, (async () => {
    let src = await texte(chemin);
    for (const m of [...src.matchAll(/from\s+"\.\/([\w.-]+\.js)"/g)]) src = src.replace(m[0], `from "${await urlDe(m[1])}"`);
    return URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
  })());
  return urls.get(chemin);
}
export const module = async (chemin) => (verrou ? import(await urlDe(chemin)) : import("./" + chemin));

// La porte : sans compte ou sans achat, on explique et on s'arrête là.
export async function porte(root) {
  if (!verrou) return;
  const s = await C.session();
  // En ligne, on redemande toujours au serveur ; hors ligne, on se fie à la dernière réponse connue.
  if (s && (await C.aDroit(MODULE, navigator.onLine))) return;
  const btn = "display:block;padding:14px 18px;border-radius:14px;font-weight:800;text-decoration:none;text-align:center";
  root.innerHTML = `<main style="max-width:420px;margin:0 auto;padding:48px 22px;display:grid;gap:16px">
    <h1 style="margin:0;font-size:1.6rem;line-height:1.2">Objectif Grand Oral</h1>
    <p style="margin:0;color:var(--muted)">${s ? `Le compte ${s.user.email} n'a pas encore accès à ce module.` : "Ce module est réservé aux comptes Prétoire. Connecte-toi pour l'ouvrir."}</p>
    ${s ? "" : `<a href="../connexion/?retour=${MODULE}" style="${btn};background:var(--brand-1);color:#fff">Me connecter</a>`}
    <a href="../#tarifs" style="${btn};border:2px solid var(--line);color:var(--fg)">Voir les tarifs</a>
    ${s ? `<p style="margin:0;color:var(--muted);font-size:.9rem">Tu viens de payer ? L'accès s'ouvre en moins d'une minute : recharge cette page.</p>` : ""}
  </main>`;
  await new Promise(() => {});
}

// Le contenu n'a pas pu être chargé (hors ligne sans copie gardée, ou accès retiré) : on le dit clairement.
export async function indisponible(root) {
  root.innerHTML = `<main style="max-width:420px;margin:0 auto;padding:48px 22px;display:grid;gap:14px">
    <h1 style="margin:0;font-size:1.5rem;line-height:1.2">Contenu indisponible</h1>
    <p style="margin:0;color:var(--muted)">Le contenu n'a pas pu être chargé. Vérifie ta connexion, puis recharge la page. La première ouverture demande d'être en ligne.</p>
    <a href="" style="display:block;padding:14px 18px;border-radius:14px;font-weight:800;text-decoration:none;text-align:center;background:var(--brand-1);color:#fff">Recharger</a>
  </main>`;
  await new Promise(() => {});
}

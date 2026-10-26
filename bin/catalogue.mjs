// Ce que chaque connexion d'OmniRoute sert vraiment.
//
// La liste qu'une connexion publie ne dit pas ce que le compte peut appeler :
// sur une clé NVIDIA gratuite, 85 modèles publiés, 13 qui répondent, une
// soixantaine en 404 « Function … not found for account ». La seule source
// juste est l'essai : une requête d'un jeton par modèle, gardée sur disque et
// refaite de temps en temps (Locaryn/Locaryn#92).
//
// N'est essayé que ce qui ne coûte rien : les fournisseurs entièrement
// gratuits (TOUT_GRATUIT), et les connexions qu'OmniRoute limite déjà aux
// modèles gratuits. Une connexion payante garde sa liste telle quelle.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adresse, gestion, jetonLocal } from "./jeton.mjs";

/** Les fournisseurs dont tout le catalogue est gratuit avec une clé de développeur. */
const TOUT_GRATUIT = new Set(["nvidia"]);

/** Ce qui n'est pas un modèle de conversation : ni essayé, ni proposé au chat. */
const SPECIALISES = /(embed|rerank|reward|safety|guard|parse|nvclip|calibration|detector|retriever|deplot|kosmos)/i;

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
/** Combien de temps un résultat vaut, selon ce qu'il dit. */
const VALIDITE = { ok: 6 * HEURE, absent: 7 * 24 * HEURE, limite: 10 * MINUTE, autre: HEURE };
/** NVIDIA : 40 requêtes par minute et 6 en même temps ; on reste en dessous. */
const ESPACEMENT_MS = 1_700;
const EN_PARALLELE = 4;
/** Au-delà, le modèle est inutilisable en pratique, même s'il finit par répondre. */
const DELAI_ESSAI_MS = 60_000;

/** Le dossier où le morph garde ses notes, à côté de la passerelle. */
function dossierNotes(passerelle) {
  const d = path.join(passerelle, "locaryn");
  mkdirSync(d, { recursive: true });
  return d;
}

const fichierSondes = (passerelle) => path.join(dossierNotes(passerelle), "sondes.json");
const fichierVerrou = (passerelle) => path.join(dossierNotes(passerelle), "sondes.verrou");
const fichierSyncs = (passerelle) => path.join(dossierNotes(passerelle), "synchronisations.json");

/** Une synchronisation par jour suffit : OmniRoute ne publie pas la date de la sienne. */
const SYNCHRO_VALABLE_MS = 24 * 60 * 60_000;

function lireJson(fichier, quoi) {
  try {
    return JSON.parse(readFileSync(fichier, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") console.error(`${quoi} illisible, repris de zéro : ${e.message}`);
    return {};
  }
}

function ecrireJson(fichier, valeur) {
  const provisoire = `${fichier}.${process.pid}.tmp`;
  writeFileSync(provisoire, JSON.stringify(valeur));
  renameSync(provisoire, fichier);
}

/** Les résultats gardés : `{ "nvidia/openai/gpt-oss-20b": { ok, statut, ms, a } }`. */
export const lireSondes = (passerelle) => lireJson(fichierSondes(passerelle), "essais");
const ecrireSondes = (passerelle, sondes) => ecrireJson(fichierSondes(passerelle), sondes);

/** Le catalogue de cette connexion est-il à ouvrir ou à resynchroniser ? */
export function synchroAFaire(passerelle, connexion, maintenant = Date.now()) {
  if (TOUT_GRATUIT.has(connexion.provider) && connexion.providerSpecificData?.importFreeModelsOnly === true) {
    return true;
  }
  const faite = lireJson(fichierSyncs(passerelle), "synchronisations")[connexion.id] ?? 0;
  return maintenant - faite > SYNCHRO_VALABLE_MS;
}

function noterSynchro(passerelle, connexion) {
  const syncs = lireJson(fichierSyncs(passerelle), "synchronisations");
  syncs[connexion.id] = Date.now();
  ecrireJson(fichierSyncs(passerelle), syncs);
}

/** Une connexion dont les modèles peuvent être essayés sans frais. */
export function essayable(connexion) {
  return (
    TOUT_GRATUIT.has(connexion.provider) ||
    connexion.providerSpecificData?.importFreeModelsOnly === true
  );
}

export const specialise = (id) => SPECIALISES.test(id);

/** Le résultat est-il encore valable ? */
export function frais(resultat, maintenant = Date.now()) {
  if (!resultat?.a) return false;
  const genre = resultat.ok
    ? "ok"
    : resultat.statut === 404 || resultat.statut === 400
      ? "absent"
      : resultat.statut === 429
        ? "limite"
        : "autre";
  return maintenant - resultat.a < VALIDITE[genre];
}

/** Les connexions actives. */
export async function connexionsActives(passerelle) {
  const { connections = [] } = await gestion(passerelle, "/api/providers");
  return connections.filter((c) => c.isActive !== false);
}

/** Les modèles qu'une connexion publie. */
export async function modelesDe(passerelle, connexion) {
  const r = await gestion(passerelle, `/api/providers/${encodeURIComponent(connexion.id)}/models`);
  return (r.models || []).map((m) => m.id).filter(Boolean);
}

/** Une requête de gestion qui exige une clé « manage » (la synchronisation). */
async function avecCleDeGestion(passerelle, action) {
  const cle = await gestion(passerelle, "/api/keys", {
    method: "POST",
    body: JSON.stringify({ name: "Locaryn (synchronisation, temporaire)", scopes: ["manage"] }),
  });
  try {
    return await action(cle.key);
  } finally {
    await gestion(passerelle, `/api/keys/${encodeURIComponent(cle.id)}`, { method: "DELETE" }).catch(
      (e) => console.error(`clé temporaire ${cle.id} non retirée : ${e.message}`),
    );
  }
}

/**
 * Ouvrir tout le catalogue d'un fournisseur gratuit, puis le synchroniser.
 *
 * OmniRoute règle une connexion NVIDIA sur « modèles gratuits seulement »
 * d'après sa propre liste, qui n'en compte que trois — dont un refusé. Tout le
 * reste était refusé (« not available in the active live catalog »).
 */
export async function synchroniser(passerelle, connexion) {
  if (!synchroAFaire(passerelle, connexion)) return false;
  const ouvrir = TOUT_GRATUIT.has(connexion.provider) && connexion.providerSpecificData?.importFreeModelsOnly === true;
  const id = encodeURIComponent(connexion.id);
  if (ouvrir) {
    await gestion(passerelle, `/api/providers/${id}`, {
      method: "PUT",
      body: JSON.stringify({ providerSpecificData: { importFreeModelsOnly: false } }),
    });
  }
  const r = await avecCleDeGestion(passerelle, async (cle) => {
    const reponse = await fetch(`${adresse()}/api/providers/${id}/sync-models`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(120_000),
    });
    if (!reponse.ok) throw new Error(`synchronisation de ${connexion.provider} : HTTP ${reponse.status}`);
    return reponse.json();
  });
  noterSynchro(passerelle, connexion);
  console.log(`${connexion.provider} : ${r.syncedModels ?? "?"} modèles synchronisés`);
  return true;
}

/** Essayer un modèle : une requête d'un jeton. */
async function essayer(jeton, modele) {
  const debut = Date.now();
  try {
    const r = await fetch(`${adresse()}/v1/chat/completions`, {
      method: "POST",
      headers: { "x-omniroute-cli-token": jeton, "Content-Type": "application/json" },
      body: JSON.stringify({ model: modele, messages: [{ role: "user", content: "OK" }], max_tokens: 1, stream: false }),
      signal: AbortSignal.timeout(DELAI_ESSAI_MS),
    });
    await r.arrayBuffer();
    return { ok: r.ok, statut: r.status, ms: Date.now() - debut, a: Date.now() };
  } catch (e) {
    return { ok: false, statut: 0, ms: Date.now() - debut, a: Date.now(), erreur: String(e?.name ?? e) };
  }
}

/** Essayer une liste, au rythme que le fournisseur tolère ; chaque résultat est gardé aussitôt. */
export async function essayerTout(passerelle, modeles) {
  const jeton = jetonLocal(passerelle);
  const sondes = lireSondes(passerelle);
  let suivant = 0;
  let prochainDepart = Date.now();
  async function ouvrier() {
    while (suivant < modeles.length) {
      const modele = modeles[suivant++];
      const attente = prochainDepart - Date.now();
      prochainDepart = Math.max(Date.now(), prochainDepart) + ESPACEMENT_MS;
      if (attente > 0) await new Promise((r) => setTimeout(r, attente));
      sondes[modele] = await essayer(jeton, modele);
      ecrireSondes(passerelle, sondes);
    }
  }
  await Promise.all(Array.from({ length: EN_PARALLELE }, ouvrier));
  return sondes;
}

/** Un essai est-il déjà en cours ? Un verrou de plus de 15 min est abandonné. */
export function essaiEnCours(passerelle) {
  const { a = 0 } = lireJson(fichierVerrou(passerelle), "verrou des essais");
  return Date.now() - a < 15 * MINUTE;
}

export function poserVerrou(passerelle) {
  writeFileSync(fichierVerrou(passerelle), JSON.stringify({ pid: process.pid, a: Date.now() }));
}

export function leverVerrou(passerelle) {
  const f = fichierVerrou(passerelle);
  if (existsSync(f)) writeFileSync(f, JSON.stringify({ a: 0 }));
}

/** Lancer les essais en arrière-plan, sans attendre ni fenêtre. */
export function essaisEnArrierePlan(passerelle) {
  if (essaiEnCours(passerelle)) return;
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "sonder.mjs");
  const enfant = spawn(process.execPath, [script, passerelle], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: process.env,
  });
  enfant.unref();
}

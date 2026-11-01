#!/usr/bin/env node
// Les limites d'utilisation des comptes branchés sur OmniRoute, pour
// `cloud_provider.local.usage_command` : la jauge du chat et la liste des
// modèles les affichent comme celles d'un abonnement.
//
// Un compte qui publie un quota (Codex, Claude…) donne un pourcentage. NVIDIA
// n'en publie pas : seulement une limite de requêtes par minute, non
// communiquée. On montre alors ce qu'on sait vraiment — les requêtes du jour,
// et un blocage en cours (trop de requêtes) avec l'heure de reprise.
//
// Usage : node utilisation.mjs <dossier de la passerelle>
// Sortie : {"windows":[…],"note":"…"}

import { gestion } from "./jeton.mjs";

const dossier = process.argv[2];

const NOMS = {
  nvidia: "NVIDIA",
  codex: "Codex",
  claude: "Claude",
  openrouter: "OpenRouter",
  gemini: "Gemini",
  deepseek: "DeepSeek",
};

function nom(fournisseur) {
  return NOMS[fournisseur] ?? fournisseur;
}

async function lire(chemin) {
  try {
    return await gestion(dossier, chemin);
  } catch (e) {
    console.error(`${chemin} : ${e.message}`);
    return null;
  }
}

function aujourdHui() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${j}`;
}

async function principal() {
  const [quota, limites, parJour] = await Promise.all([
    lire("/api/usage/quota"),
    lire("/api/rate-limits"),
    lire("/api/usage/requests-by-provider-date"),
  ]);
  const fenetres = [];
  let sansQuota = [];

  for (const c of quota?.providers ?? []) {
    if (typeof c.quotaTotal === "number" && c.quotaTotal > 0) {
      fenetres.push({
        id: `${c.provider}:${c.connectionId}`,
        label: nom(c.provider),
        used_percent: Math.max(0, Math.min(100, 100 - (c.percentRemaining ?? 100))),
        resets_at: c.resetAt ?? null,
        status: (c.percentRemaining ?? 100) <= 0 ? "rejected" : "allowed",
      });
    } else {
      sansQuota.push(c);
    }
  }

  const jour = aujourdHui();
  const bloques = new Map();
  for (const l of limites?.lockouts ?? []) {
    const fournisseur = l.provider ?? String(l.key ?? "").split(":")[0];
    if (fournisseur) bloques.set(fournisseur, l.until ?? l.resetAt ?? l.expiresAt ?? null);
  }
  sansQuota = sansQuota.filter((c, i, t) => t.findIndex((x) => x.provider === c.provider) === i);
  for (const c of sansQuota) {
    const requetes = (parJour?.rows ?? [])
      .filter((r) => r.provider === c.provider && r.date === jour)
      .reduce((n, r) => n + (r.requests ?? 0), 0);
    const bloque = bloques.has(c.provider);
    fenetres.push({
      id: `${c.provider}:jour`,
      label: `${nom(c.provider)} · ${requetes} requête${requetes > 1 ? "s" : ""} aujourd'hui`,
      used_percent: null,
      resets_at: bloque ? bloques.get(c.provider) : null,
      status: bloque ? "rejected" : "allowed",
    });
  }

  const note = sansQuota.some((c) => c.provider === "nvidia")
    ? "NVIDIA ne publie pas de quota : seulement une limite de requêtes par minute, affichée sur build.nvidia.com. Au-delà, les réponses sont refusées quelques instants."
    : null;
  process.stdout.write(`${JSON.stringify({ plan: null, windows: fenetres, note })}\n`);
}

principal().catch((e) => {
  console.error(e?.message ?? e);
  process.stdout.write(`${JSON.stringify({ windows: [], note: null })}\n`);
});

#!/usr/bin/env node
// Régler OmniRoute pour Locaryn, une fois la passerelle prête (`after_start`).
//
// Un fournisseur limité en débit (NVIDIA : 40 requêtes par minute, 6 en même
// temps) met les requêtes en file ; au-delà de `requestQueue.maxWaitMs`
// (15 s par défaut), OmniRoute répond 504. Plusieurs sous-agents sur le même
// fournisseur s'étouffaient ainsi l'un l'autre. Deux minutes laissent la
// file s'écouler. Un réglage déjà plus long, choisi par la personne, est
// gardé.
//
// Usage : node regler.mjs <dossier de la passerelle>

import { gestion } from "./jeton.mjs";

const ATTENTE_MINIMALE_MS = 120_000;

async function principal() {
  const dossier = process.argv[2];
  if (!dossier) throw new Error("dossier de la passerelle manquant");
  const actuel = await gestion(dossier, "/api/resilience");
  const attente = actuel?.requestQueue?.maxWaitMs ?? 0;
  if (attente >= ATTENTE_MINIMALE_MS) {
    console.log(`file d'attente déjà à ${attente} ms : rien à changer`);
    return;
  }
  await gestion(dossier, "/api/resilience", {
    method: "PATCH",
    body: JSON.stringify({ requestQueue: { maxWaitMs: ATTENTE_MINIMALE_MS } }),
  });
  console.log(`file d'attente portée de ${attente} à ${ATTENTE_MINIMALE_MS} ms`);
}

principal().catch((e) => {
  console.error(`réglage d'OmniRoute impossible : ${e.message}`);
  process.exit(1);
});

#!/usr/bin/env node
// Les modèles qu'OmniRoute sert vraiment, pour `cloud_provider.local.available_models`.
//
// `/v1/models` publie aussi les modèles des fournisseurs non connectés, et la
// liste de gestion `/api/models` marque « available » des modèles que le
// compte ne sert pas (« not available in the active live catalog »). La seule
// source juste est le catalogue vivant de chaque connexion active :
// `/api/providers/{id}/models`. La CLI d'OmniRoute ne sait pas appeler cette
// route (paramètre de chemin perdu), d'où ce script.
//
// Usage : node disponibles.mjs <dossier de la passerelle>
// Sortie : {"models":[{"id":"nvidia/openai/gpt-oss-20b"}, …]}

import { gestion } from "./jeton.mjs";

async function principal() {
  const dossier = process.argv[2];
  if (!dossier) throw new Error("dossier de la passerelle manquant");
  const { connections = [] } = await gestion(dossier, "/api/providers");
  const actives = connections.filter((c) => c.isActive !== false);
  const listes = await Promise.all(
    actives.map(async (c) => {
      try {
        const r = await gestion(dossier, `/api/providers/${encodeURIComponent(c.id)}/models`);
        return (r.models || []).map((m) => ({ id: `${c.provider}/${m.id}` }));
      } catch (e) {
        console.error(`connexion ${c.provider} : ${e.message}`);
        return [];
      }
    }),
  );
  process.stdout.write(JSON.stringify({ models: listes.flat() }));
}

principal().catch((e) => {
  console.error(`modèles disponibles illisibles : ${e.message}`);
  process.exit(1);
});

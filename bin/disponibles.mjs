#!/usr/bin/env node
// Les modèles qu'OmniRoute sert vraiment, pour `cloud_provider.local.available_models`.
//
// `/v1/models` publie aussi les modèles des fournisseurs non connectés, et ce
// qu'une connexion publie n'est pas ce que le compte peut appeler. Pour une
// connexion gratuite, la réponse vient des essais (catalogue.mjs) : un modèle
// essayé qui a échoué est écarté, un modèle pas encore essayé est gardé le
// temps de l'essai, qui part en arrière-plan. Une connexion payante garde sa
// liste : l'essayer coûterait.
//
// Usage : node disponibles.mjs <dossier de la passerelle>
// Sortie : {"models":[{"id":"nvidia/openai/gpt-oss-20b"}, …]}

import {
  connexionsActives,
  essaisEnArrierePlan,
  essayable,
  frais,
  lireSondes,
  modelesDe,
  specialise,
  synchroAFaire,
} from "./catalogue.mjs";

/** Les modèles retenus d'une connexion, et s'il en reste à essayer. */
function retenus(connexion, ids, sondes) {
  if (!essayable(connexion)) {
    return { garder: ids.map((id) => `${connexion.provider}/${id}`), aEssayer: false };
  }
  let aEssayer = false;
  const garder = [];
  for (const id of ids) {
    if (specialise(id)) continue;
    const modele = `${connexion.provider}/${id}`;
    const resultat = sondes[modele];
    if (!resultat || !frais(resultat)) aEssayer = true;
    // Le dernier résultat connu fait foi, même périmé, en attendant le suivant.
    if (!resultat || resultat.ok) garder.push(modele);
  }
  return { garder, aEssayer };
}

async function principal() {
  const passerelle = process.argv[2];
  if (!passerelle) throw new Error("dossier de la passerelle manquant");
  const sondes = lireSondes(passerelle);
  const listes = [];
  let relancer = false;
  for (const c of await connexionsActives(passerelle)) {
    try {
      const { garder, aEssayer } = retenus(c, await modelesDe(passerelle, c), sondes);
      listes.push(...garder);
      relancer ||= aEssayer || (essayable(c) && synchroAFaire(passerelle, c));
    } catch (e) {
      console.error(`connexion ${c.provider} : ${e.message}`);
    }
  }
  if (relancer) essaisEnArrierePlan(passerelle);
  process.stdout.write(JSON.stringify({ models: listes.map((id) => ({ id })) }));
}

principal().catch((e) => {
  console.error(`modèles disponibles illisibles : ${e.message}`);
  process.exit(1);
});

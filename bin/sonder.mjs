#!/usr/bin/env node
// Essayer, en arrière-plan, les modèles dont on ne sait pas encore s'ils
// répondent (voir catalogue.mjs). Lancé par `disponibles.mjs` et `regler.mjs`,
// jamais attendu : la liste se précise à mesure que les résultats arrivent.
//
// Usage : node sonder.mjs <dossier de la passerelle>

import {
  connexionsActives,
  essaiEnCours,
  essayable,
  essayerTout,
  frais,
  leverVerrou,
  lireSondes,
  modelesDe,
  poserVerrou,
  specialise,
  synchroniser,
} from "./catalogue.mjs";

/** Les modèles d'une connexion qui attendent un essai, les inconnus d'abord. */
function aEssayer(provider, ids, sondes) {
  const candidats = ids.filter((id) => !specialise(id)).map((id) => `${provider}/${id}`);
  const inconnus = candidats.filter((m) => !sondes[m]);
  const perimes = candidats.filter((m) => sondes[m] && !frais(sondes[m]));
  return [...inconnus, ...perimes];
}

async function principal() {
  const passerelle = process.argv[2];
  if (!passerelle) throw new Error("dossier de la passerelle manquant");
  if (essaiEnCours(passerelle)) return;
  poserVerrou(passerelle);
  try {
    const sondes = lireSondes(passerelle);
    const file = [];
    for (const c of (await connexionsActives(passerelle)).filter(essayable)) {
      await synchroniser(passerelle, c).catch((e) => console.error(e.message));
      file.push(...aEssayer(c.provider, await modelesDe(passerelle, c), sondes));
    }
    if (file.length) await essayerTout(passerelle, file);
  } finally {
    leverVerrou(passerelle);
  }
}

principal().catch((e) => {
  console.error(`essais des modèles interrompus : ${e.message}`);
  process.exit(1);
});

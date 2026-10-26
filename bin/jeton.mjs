// Parler à l'API de gestion d'OmniRoute comme le fait sa propre CLI : un HMAC
// du machine-id, accepté sur la boucle locale seulement. Aucun mot de passe,
// aucune clé.

import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

const SEL_PAR_DEFAUT = "omniroute-cli-auth-v1";

/** Le jeton local, calculé avec le `node-machine-id` installé dans la passerelle. */
export function jetonLocal(dossierPasserelle) {
  const exiger = createRequire(path.join(dossierPasserelle, "node_modules", "noop.js"));
  const machine = exiger("node-machine-id");
  const machineIdSync = machine.machineIdSync || machine.default?.machineIdSync;
  const brut = machineIdSync(true);
  const sel = process.env.OMNIROUTE_CLI_SALT || SEL_PAR_DEFAUT;
  return crypto.createHmac("sha256", brut).update(sel).digest("hex");
}

/** L'adresse de la passerelle sur la boucle locale. */
export function adresse() {
  return `http://127.0.0.1:${process.env.PORT || "20128"}`;
}

/** Une requête de gestion ; une réponse hors 2xx est une erreur. */
export async function gestion(dossierPasserelle, chemin, options = {}) {
  const reponse = await fetch(adresse() + chemin, {
    ...options,
    headers: {
      "x-omniroute-cli-token": jetonLocal(dossierPasserelle),
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!reponse.ok) throw new Error(`${chemin} : HTTP ${reponse.status}`);
  return reponse.json();
}

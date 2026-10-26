# morph-omniroute

> Une seule adresse pour des centaines de modèles — Claude, GPT, Gemini, Llama,
> et des modèles gratuits dès l'installation. La passerelle
> [OmniRoute](https://github.com/diegosouzapw/OmniRoute) tourne sur votre
> machine ; Locaryn l'installe, la démarre et lui parle.

---

## Ce que ce morph apporte

Un **dossier** dans « Mes modèles », à la place d'une carte de modèle, et le
même dans le sélecteur de modèle du chat. On l'ouvre, on choisit le modèle qui
répondra, et la conversation part chez lui.

Sans rien configurer, OmniRoute route déjà vers des fournisseurs gratuits : le
modèle `auto` répond dès le premier démarrage. Pour vos propres abonnements
(Anthropic, OpenAI, Google…), ouvrez son tableau de bord et connectez-les :
leurs clés restent dans la passerelle, Locaryn ne les voit jamais.

## Ce que Locaryn fait pour vous

Rien n'est à taper ni à recopier.

1. **L'installation.** OmniRoute (version épinglée, 3.8.50) s'installe dans le
   dossier de données de Locaryn — `gateways/omniroute` — et non dans le dossier
   global de npm. Il pèse environ 450 Mo : le poser sur le disque système, et
   hors de portée de la désinstallation du morph, n'aurait servi personne.
2. **La sécurité.** Par défaut, OmniRoute écoute sur toutes les interfaces
   réseau sans exiger de clé : n'importe quel appareil de votre réseau pourrait
   dépenser vos quotas. Locaryn la lance sur la **boucle locale** uniquement.
   Son paquet npm embarque aussi des secrets identiques pour tous et le mot de
   passe `CHANGEME` : Locaryn génère les siens à la première installation et
   les garde dans le trousseau du système.
3. **La clé.** Au premier démarrage, Locaryn demande une clé à OmniRoute par sa
   propre ligne de commande et la range dans le trousseau. Sans elle, la liste
   des modèles reste fermée.
4. **Le tableau de bord.** Il s'ouvre dans votre navigateur — OmniRoute
   interdit d'être affiché dans une autre application. Le mot de passe généré
   est affiché dans le dossier, avec un bouton pour le copier.

Désinstaller le morph retire le programme. Ses données — les fournisseurs que
vous avez connectés — restent dans `gateways/omniroute/data`, et une
réinstallation les retrouve.

## Prérequis

Node.js 22 (22.22.2 ou plus) ou Node.js 24, depuis [nodejs.org](https://nodejs.org).
Le dossier le dit clairement s'il manque.

## Le premier démarrage est long

OmniRoute prépare sa base de données au premier lancement : comptez une à deux
minutes. Les suivants prennent quelques secondes.

## Le catalogue se met à jour tout seul

La liste des modèles est lue chez OmniRoute — `GET /v1/models` — et non figée
dans ce paquet. Un fournisseur ajouté dans le tableau de bord ce matin apparaît
dans Locaryn sans nouvelle version du morph.

## Avec un noyau alternatif

Un modèle OmniRoute fonctionne aussi quand la conversation est confiée à un
noyau apporté par un autre morph (Hermes Agent). L'identifiant du modèle est
transmis tel quel au noyau, qui le route à son tour.

## Il faut connecter au moins un fournisseur

Sans compte connecté, le modèle « auto » d'OmniRoute n'a vers qui router : les
routes gratuites sans clé (OpenCode, Felo…) refusent désormais les clients
tiers et la conversation répond 502. Dans le tableau de bord, **Providers →
Add Provider**, ajoutez au moins un fournisseur gratuit sans carte bancaire :
Google AI Studio (Gemini), Groq, OpenRouter (modèles `:free`), Mistral
(offre Experiment), NVIDIA NIM, GitHub Models, Cloudflare Workers AI,
Hugging Face.

## Notes techniques (ce que le manifeste règle)

Tout ce qui suit est déclaré dans `morph.json` ; l'application n'en sait rien
d'autre que ce que le manifeste lui dit.

- **Écoute** : par défaut OmniRoute ouvre toutes les interfaces sans clé ; le
  manifeste impose `OMNIROUTE_SERVER_HOST=127.0.0.1`.
- **Secrets** : le paquet npm embarque un `.env` au même `JWT_SECRET` pour
  toutes les installations et le mot de passe `CHANGEME`. Le manifeste déclare
  `JWT_SECRET`, `API_KEY_SECRET` et `INITIAL_PASSWORD` comme secrets : Locaryn
  en génère des valeurs propres à l'installation, qui priment sur ce fichier
  (`JWT_SECRET` doit faire au moins 32 caractères).
- **Clé** : `omniroute api api-keys post-api-keys` crée une clé sans mot de
  passe, authentifiée par un jeton dérivé de la machine. Sans clé,
  `/v1/models` répond 401. La passerelle répond avant que cette API soit
  prête : Locaryn retente.
- **Premier démarrage** : 159 migrations, plus d'une minute —
  `start_timeout_seconds: 180`.
- **Tableau de bord** : `X-Frame-Options: DENY`, il s'ouvre dans le navigateur.
- **Vérifier le manifeste** : depuis un clone de Locaryn, ce dossier dans
  `plugins/`, `cargo test -p locaryn-extensions les_manifestes_des_morphs_presents_se_lisent` ;
  puis contre la vraie passerelle :
  `LOCARYN_PASSERELLE_MORPH=plugins/morph-omniroute cargo test -p locaryn-cloud-providers --test passerelle_reelle -- --ignored --nocapture`.

## Licence

Apache-2.0. OmniRoute est un projet indépendant, sous sa propre licence : ce
morph l'installe depuis npm, il ne le redistribue pas.

## Les modèles « utilisables »

OmniRoute publie dans `/v1/models` les modèles de tous les fournisseurs qu'il
sait router, connectés ou non, et ce qu'une connexion publie n'est pas ce que
le compte peut appeler : sur une clé NVIDIA gratuite, 85 modèles publiés,
une dizaine qui répondent, une soixantaine en 404 « not found for account ».

La seule source juste est l'essai. Pour chaque connexion gratuite,
`bin/sonder.mjs` envoie une requête d'un jeton à chaque modèle, au rythme que
le fournisseur tolère (NVIDIA : 40 par minute), et garde le résultat dans
`<passerelle>/locaryn/sondes.json`. `bin/disponibles.mjs` ne propose que ce qui
a répondu ; un modèle pas encore essayé reste proposé le temps de l'essai.

| Résultat | Réessayé après |
|---|---|
| a répondu | 6 h |
| 404 / 400 (retiré, fermé au compte) | 7 jours |
| aucune réponse en 60 s, 5xx | 1 h |
| 429 (limite de débit) | 10 min |

Ne sont essayés que les modèles qui ne coûtent rien : les fournisseurs
entièrement gratuits (NVIDIA) et les connexions qu'OmniRoute limite déjà aux
modèles gratuits. Une connexion payante garde sa liste telle quelle. Les
modèles spécialisés (plongements, classement, sécurité, lecture de documents)
ne sont ni essayés ni proposés au chat.

Pour NVIDIA, OmniRoute règle la connexion sur « modèles gratuits seulement »
d'après sa propre liste, qui n'en compte que trois — dont un que le compte
refuse. Tout le catalogue de NVIDIA étant gratuit avec une clé de
développeur, le morph lève ce réglage et synchronise la liste complète, une
fois par jour, avec une clé de gestion temporaire retirée aussitôt.

## Réglé pour les sous-agents

Un fournisseur limité en débit (NVIDIA : 40 requêtes par minute, 6 en même
temps) met les requêtes en file, et OmniRoute répond 504 au-delà de
15 secondes d'attente. `bin/regler.mjs`, lancé après chaque démarrage, porte
cette attente à deux minutes, sauf si vous l'avez réglée plus longue.

Les scripts parlent à l'API de gestion avec le jeton local de la CLI
d'OmniRoute (`bin/jeton.mjs`) : boucle locale seulement, aucun mot de passe.

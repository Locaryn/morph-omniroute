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

## Licence

Apache-2.0. OmniRoute est un projet indépendant, sous sa propre licence : ce
morph l'installe depuis npm, il ne le redistribue pas.

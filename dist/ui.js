/* morph-omniroute — les modèles d'OmniRoute.
 *
 * Rendu dans le document, sans racine fantôme : le panneau hérite du thème et
 * des composants de l'application (`locaryn-card`, `locaryn-input`,
 * `locaryn-chip`, `locaryn-cloud-*`) au lieu de recopier un style qui
 * vieillirait à part.
 *
 * Ce que ce panneau ne fait plus, et pourquoi :
 *
 * - **Démarrer ou arrêter la passerelle.** C'est l'écran de l'application qui
 *   le fait, juste au-dessus : il tient aussi le mot de passe du tableau de
 *   bord, qu'un panneau d'extension ne doit jamais voir. Deux cartes pour le
 *   même bouton se contrediraient.
 * - **Afficher le tableau de bord dans un cadre.** OmniRoute l'interdit
 *   (`X-Frame-Options: DENY`) : le cadre restait blanc. Il s'ouvre dans le
 *   navigateur depuis la carte de la passerelle.
 * - **Exiger une clé.** OmniRoute converse sans clé, et Locaryn obtient
 *   lui-même celle qui ouvre la liste des modèles.
 *
 * Tout passe par l'hôte : le panneau n'ouvre aucune connexion lui-même et ne
 * peut pas relire la clé qu'il a fait écrire. */
(function () {
  "use strict";

  var PROVIDER = "omniroute";

  function bridge() {
    return window.locaryn || window.LocarynPluginAPI || null;
  }

  function contexte(n) {
    if (!n) return "—";
    if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 ? 1 : 0) + " M";
    if (n >= 1000) return Math.round(n / 1000) + " k";
    return String(n);
  }

  function prix(p) {
    if (p === null || p === undefined) return "—";
    if (p === 0) return "gratuit";
    return p < 1 ? p.toFixed(2) + " $" : p.toFixed(p < 10 ? 2 : 0) + " $";
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  class LocarynOmniRoutePanel extends HTMLElement {
    constructor() {
      super();
      this.models = [];
      this.query = "";
      /** `tous`, `outils`, `vision`, `gratuits`. */
      // OmniRoute publie aussi les modèles des fournisseurs non connectés,
      // qui échouent tous : on montre d'abord ceux qu'elle sert vraiment.
      this.filter = "utilisables";
      this.provider = null;
      this.running = false;
      this.busy = false;
      this.message = null;
      this.error = null;
      this.editingKey = false;
      this.timer = null;
    }

    connectedCallback() {
      this.render();
      this.load(false);
      // La carte de la passerelle, au-dessus, peut la démarrer à tout moment :
      // relire l'état régulièrement évite une liste vide sous une passerelle
      // qui répond déjà. Une sonde toutes les quatre secondes, pas plus.
      var self = this;
      this.timer = window.setInterval(function () {
        if (!self.running && !self.busy) self.load(false);
      }, 4000);
    }

    disconnectedCallback() {
      if (this.timer) window.clearInterval(this.timer);
      this.timer = null;
    }

    /** L'état de la passerelle, puis son catalogue. */
    async load(refresh) {
      var api = bridge();
      if (!api || !api.providers) {
        this.error = "Cette version de Locaryn ne sait pas encore servir une passerelle.";
        this.render();
        return;
      }
      this.busy = true;
      this.render();
      try {
        var list = await api.providers.list();
        this.provider =
          list.filter(function (p) {
            return p.id === PROVIDER;
          })[0] || null;
        var status = await api.providers.status(PROVIDER);
        this.running = !!(status && status.running);
        // Une passerelle éteinte n'a pas de catalogue : demander la liste
        // afficherait une erreur réseau là où il suffit de dire « démarrez-la ».
        this.models = this.running ? await api.providers.models(PROVIDER, refresh === true) : [];
        this.error = null;
      } catch (e) {
        this.error = String((e && e.message) || e);
      } finally {
        this.busy = false;
        this.render();
      }
    }

    async saveKey(value) {
      var api = bridge();
      if (!api || !value.trim()) return;
      this.busy = true;
      this.error = null;
      this.render();
      try {
        await api.providers.setKey(PROVIDER, value.trim());
        this.message = "Clé enregistrée dans le trousseau du système.";
        this.editingKey = false;
        await this.load(true);
      } catch (e) {
        this.error = String((e && e.message) || e);
        this.busy = false;
        this.render();
      }
    }

    async select(id) {
      var api = bridge();
      if (!api) return;
      this.error = null;
      try {
        await api.providers.select(PROVIDER, id);
        this.message = id + " répondra dans la conversation.";
        if (api.ui && api.ui.showToast) api.ui.showToast(this.message, "success");
        await this.load(false);
      } catch (e) {
        this.error = String((e && e.message) || e);
        this.render();
      }
    }

    visibles() {
      var q = this.query.trim().toLowerCase();
      var filter = this.filter;
      return this.models.filter(function (m) {
        if (q) {
          var foin = (m.id + " " + m.name + " " + (m.description || "")).toLowerCase();
          if (foin.indexOf(q) === -1) return false;
        }
        if (filter === "utilisables") return m.available !== false;
        if (filter === "outils") return m.supports_tools === true && m.available !== false;
        if (filter === "vision") return (m.modality || "").indexOf("image") !== -1;
        if (filter === "gratuits") return m.prompt_price_per_m === 0;
        return true;
      });
    }

    renderKey(root) {
      var self = this;
      var a = this.provider && this.provider.has_key;
      var carte = el("div", "locaryn-card locaryn-cloud-key");
      var tete = el("div", "locaryn-field-head");
      tete.style.marginBottom = "8px";
      var titre = el("h3", null, "La clé d'accès à OmniRoute");
      titre.style.cssText = "margin:0;font-size:13px";
      tete.appendChild(titre);
      tete.appendChild(
        el("span", "locaryn-tag" + (a ? " locaryn-tag-installed" : ""), a ? "Obtenue" : "En attente"),
      );
      carte.appendChild(tete);
      carte.appendChild(
        el(
          "p",
          "locaryn-cloud-help",
          a
            ? "Locaryn l'a obtenue auprès d'OmniRoute et la garde dans le trousseau du système. " +
                "Vous n'avez rien à faire."
            : "Locaryn la demande à OmniRoute dès que la passerelle répond. En l'attendant, la " +
                "conversation fonctionne déjà : seule la liste complète des modèles en a besoin.",
        ),
      );

      if (this.editingKey) {
        var ligne = el("div", "locaryn-cloud-key-row");
        var champ = el("input", "locaryn-input");
        champ.type = "password";
        champ.autocomplete = "off";
        champ.placeholder = "Clé créée dans le tableau de bord d'OmniRoute";
        var valider = el("button", "locaryn-btn-primary", this.busy ? "…" : "Enregistrer");
        valider.type = "button";
        valider.disabled = this.busy;
        valider.addEventListener("click", function () {
          self.saveKey(champ.value);
        });
        champ.addEventListener("keydown", function (event) {
          if (event.key === "Enter") self.saveKey(champ.value);
          if (event.key === "Escape") {
            self.editingKey = false;
            self.render();
          }
        });
        var annuler = el("button", "locaryn-chip", "Annuler");
        annuler.type = "button";
        annuler.addEventListener("click", function () {
          self.editingKey = false;
          self.render();
        });
        ligne.appendChild(champ);
        ligne.appendChild(valider);
        ligne.appendChild(annuler);
        carte.appendChild(ligne);
      } else {
        // Remplacer la clé reste possible — une clé révoquée dans le tableau
        // de bord, par exemple — mais ce n'est plus le chemin ordinaire.
        var remplacer = el("button", "locaryn-chip", a ? "Remplacer la clé" : "Coller une clé");
        remplacer.type = "button";
        remplacer.addEventListener("click", function () {
          self.editingKey = true;
          self.render();
        });
        carte.appendChild(remplacer);
      }
      root.appendChild(carte);
    }

    render() {
      var self = this;
      this.textContent = "";
      var root = el("div", "locaryn-cloud-dashboard");

      this.renderKey(root);

      if (this.error) root.appendChild(el("div", "locaryn-cloud-error", this.error));
      else if (this.message) root.appendChild(el("div", "locaryn-cloud-notice", this.message));

      // ── Les modèles routés ─────────────────────────────────────────────
      var barre = el("div", "locaryn-cloud-toolbar");
      var recherche = el("input", "locaryn-input");
      var utilisables = this.models.filter(function (m) {
        return m.available !== false;
      }).length;
      recherche.placeholder =
        utilisables < this.models.length
          ? "Rechercher parmi " + utilisables + " modèles utilisables (" + this.models.length + " routés)…"
          : "Rechercher parmi " + this.models.length + " modèles routés…";
      recherche.value = this.query;
      recherche.addEventListener("input", function () {
        self.query = recherche.value;
        self.renderListe();
      });
      barre.appendChild(recherche);
      var actualiser = el("button", "locaryn-chip", this.busy ? "…" : "Actualiser");
      actualiser.type = "button";
      actualiser.title = "Relire la liste chez OmniRoute";
      actualiser.disabled = this.busy || !this.running;
      actualiser.addEventListener("click", function () {
        self.load(true);
      });
      barre.appendChild(actualiser);
      root.appendChild(barre);

      var filtres = el("div", "locaryn-cloud-toolbar");
      [
        ["utilisables", "Utilisables"],
        ["tous", "Tous"],
        ["outils", "Appel d'outils"],
        ["vision", "Vision"],
        ["gratuits", "Gratuits"],
      ].forEach(function (paire) {
        var chip = el(
          "button",
          "locaryn-chip" + (self.filter === paire[0] ? " locaryn-chip-on" : ""),
          paire[1],
        );
        chip.type = "button";
        chip.addEventListener("click", function () {
          self.filter = paire[0];
          self.render();
        });
        filtres.appendChild(chip);
      });
      root.appendChild(filtres);

      this.liste = el("div", "locaryn-cloud-models");
      root.appendChild(this.liste);
      this.appendChild(root);
      this.renderListe();
    }

    /** La liste seule : la recherche ne doit pas reconstruire le champ qu'on
     *  est en train de remplir, ni lui faire perdre le curseur. */
    renderListe() {
      var self = this;
      if (!this.liste) return;
      this.liste.textContent = "";

      if (!this.running) {
        this.liste.appendChild(
          el(
            "div",
            "locaryn-cloud-empty",
            this.busy
              ? "Vérification d'OmniRoute…"
              : "Démarrez la passerelle ci-dessus pour voir les modèles qu'elle route.",
          ),
        );
        return;
      }
      if (this.busy && this.models.length === 0) {
        this.liste.appendChild(el("div", "locaryn-cloud-empty", "Lecture du catalogue…"));
        return;
      }
      var visibles = this.visibles();
      if (visibles.length === 0) {
        this.liste.appendChild(
          el(
            "div",
            "locaryn-cloud-empty",
            this.models.length === 0
              ? "La liste des modèles s'ouvre avec la clé d'accès, que Locaryn obtient dans un instant."
              : "Aucun modèle ne correspond.",
          ),
        );
        return;
      }
      var actif = this.provider && this.provider.active_model;

      visibles.slice(0, 300).forEach(function (m) {
        var carte = el("div", "locaryn-cloud-model" + (actif === m.id ? " locaryn-active" : ""));
        var gauche = el("div");
        gauche.style.minWidth = "0";
        gauche.appendChild(el("div", "locaryn-cloud-model-name", m.name || m.id));
        gauche.appendChild(el("div", "locaryn-cloud-model-id", m.id));
        var faits = el("div", "locaryn-cloud-model-facts");
        faits.appendChild(el("span", null, contexte(m.context_length) + " jetons"));
        faits.appendChild(
          el(
            "span",
            null,
            prix(m.prompt_price_per_m) + " / " + prix(m.completion_price_per_m) + " par M",
          ),
        );
        if (m.supports_tools) faits.appendChild(el("span", null, "outils"));
        if (m.available === false) faits.appendChild(el("span", null, "fournisseur non connecté"));
        if ((m.modality || "").indexOf("image") !== -1) faits.appendChild(el("span", null, "vision"));
        gauche.appendChild(faits);
        carte.appendChild(gauche);

        var choisir = el(
          "button",
          actif === m.id ? "locaryn-chip locaryn-chip-on" : "locaryn-chip",
          actif === m.id ? "Actif" : "Utiliser",
        );
        choisir.type = "button";
        choisir.addEventListener("click", function () {
          self.select(m.id);
        });
        carte.appendChild(choisir);
        self.liste.appendChild(carte);
      });

      if (visibles.length > 300) {
        this.liste.appendChild(
          el(
            "div",
            "locaryn-cloud-empty",
            visibles.length - 300 + " modèles de plus — affinez la recherche.",
          ),
        );
      }
    }
  }

  // Un élément personnalisé ne se redéfinit pas : sans cette garde, recharger
  // le panneau après une mise à jour lèverait, et l'écran resterait vide.
  if (!customElements.get("locaryn-omniroute-panel")) {
    customElements.define("locaryn-omniroute-panel", LocarynOmniRoutePanel);
  }
})();

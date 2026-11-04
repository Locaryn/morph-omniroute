// Le quota du compte, dessiné par le morph dans trois emplacements que
// l'application ouvre aux extensions :
//   - `composer.status`      : la pastille à droite de la jauge de mémoire ;
//   - `models.folder.tile`   : le résumé sur la tuile du dossier ;
//   - `models.folder.header` : le détail en tête du dossier, et les tâches de
//     fond de l'application que ce compte a le droit de faire (coupées par
//     défaut : elles consommeraient le quota pour presque rien).
//
// L'application ne connaît rien de ce compte : elle donne le modèle actif et
// son fournisseur (`context`), relaie les limites que le manifeste publie
// (`providers.usage`) et garde les autorisations (`providers.backgroundTasks`).
//
// Rendu dans le document avec les classes de l'application ; aucun attribut
// `style` (la politique de sécurité de l'hôte les bloque) : `element.style`.
(function () {
  "use strict";

  // ── Réglages propres à ce morph ──────────────────────────────────────────
  var CONFIG = {
    /** L'identifiant du `cloud_provider` déclaré par le manifeste. */
    provider: "omniroute",
    /** Le préfixe des balises : unique par morph. */
    prefixe: "locaryn-omniroute",
    /** Le nom affiché. */
    nom: "OmniRoute",
    /** Une passerelle publie les fenêtres de tous ses comptes, préfixées
     *  `fournisseur:` : ne montrer dans le chat que celles du modèle actif. */
    filtrerParModele: true,
  };

  /** La fenêtre de la semaine : c'est elle qui borne vraiment un abonnement. */
  function estHebdo(w) {
    return /^seven_day/.test(w.id || "") || w.id === "secondary" || /^7 jours/.test(w.label || "");
  }

  // ── Outils ───────────────────────────────────────────────────────────────
  function api() {
    return window.locaryn || window.LocarynPluginAPI || null;
  }

  function el(tag, attrs, styles, enfants) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    if (styles) Object.assign(n.style, styles);
    (enfants || []).forEach(function (c) {
      if (c !== null && c !== undefined) n.append(c);
    });
    return n;
  }

  var SVG = "http://www.w3.org/2000/svg";
  function anneau(pct) {
    var r = 7;
    var c = 2 * Math.PI * r;
    var svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 18 18");
    svg.setAttribute("aria-hidden", "true");
    var rail = document.createElementNS(SVG, "circle");
    var arc = document.createElementNS(SVG, "circle");
    [rail, arc].forEach(function (k) {
      k.setAttribute("cx", "9");
      k.setAttribute("cy", "9");
      k.setAttribute("r", String(r));
    });
    rail.setAttribute("class", "locaryn-usage-rail");
    arc.setAttribute("class", "locaryn-usage-arc");
    arc.setAttribute("stroke-dasharray", (Math.min(100, pct) / 100) * c + " " + c);
    arc.setAttribute("transform", "rotate(-90 9 9)");
    svg.append(rail, arc);
    return svg;
  }

  function niveau(pct) {
    return pct >= 90 ? "danger" : pct >= 70 ? "warn" : "ok";
  }

  /** « dans 2 h 13 », « dans 4 j » : quand la fenêtre repart de zéro. */
  function avant(iso) {
    if (!iso) return null;
    var t = Date.parse(iso);
    if (isNaN(t)) return null;
    var s = Math.max(0, Math.round((t - Date.now()) / 1000));
    if (s < 60) return "dans un instant";
    var min = Math.round(s / 60);
    if (min < 60) return "dans " + min + " min";
    var h = Math.floor(min / 60);
    if (h < 48) return "dans " + h + " h " + String(min % 60).padStart(2, "0");
    return "dans " + Math.round(h / 24) + " j";
  }

  function etatSansPourcentage(w) {
    return w.status === "rejected" ? "Limite atteinte" : "Dans la limite";
  }

  function aPct(w) {
    return typeof w.used_percent === "number";
  }

  function connues(usage) {
    return ((usage && usage.windows) || []).filter(function (w) {
      return aPct(w) || w.status;
    });
  }

  /** Les fenêtres du fournisseur qui sert ce modèle (`nvidia/…` → `nvidia:`). */
  function pourLeModele(fenetres, model) {
    var prefixe = String(model || "").split("/")[0].toLowerCase();
    var avecCompte = function (w) {
      return String(w.id || "").indexOf(":") > 0;
    };
    var duModele = fenetres.filter(function (w) {
      return avecCompte(w) && String(w.id).split(":")[0].toLowerCase() === prefixe;
    });
    if (!prefixe || duModele.length === 0) return fenetres;
    return fenetres
      .filter(function (w) {
        return !avecCompte(w);
      })
      .concat(duModele);
  }

  function lireUsage() {
    var a = api();
    if (!a || !a.providers || !a.providers.usage) return Promise.resolve(null);
    return a.providers.usage(CONFIG.provider).catch(function (e) {
      console.warn("[" + CONFIG.nom + "] limites illisibles :", e);
      return null;
    });
  }

  /** Une ligne de détail : libellé, pourcentage ou état, barre, reprise. */
  function ligneDetail(w, restant) {
    var pct = w.used_percent;
    var valeur = aPct(w)
      ? restant
        ? Math.max(0, 100 - Math.round(pct)) + " % restants"
        : Math.round(pct) + " %"
      : etatSansPourcentage(w);
    var barre = null;
    if (aPct(w)) {
      var plein = el("span", {}, { width: Math.min(100, pct) + "%" });
      barre = el("div", { class: "locaryn-usage-bar is-" + niveau(pct) }, null, [plein]);
    }
    var reprise = avant(w.resets_at);
    return el("div", { class: "locaryn-usage-row" }, null, [
      el("div", { class: "locaryn-usage-row-head" }, null, [
        el("span", {}, null, [w.label]),
        el("span", { class: "locaryn-usage-pct" }, null, [valeur]),
      ]),
      barre,
      reprise ? el("div", { class: "locaryn-usage-reset" }, null, ["Repart de zéro " + reprise]) : null,
    ]);
  }

  function ligneCredits(credits) {
    return el("div", { class: "locaryn-usage-row" }, null, [
      el("div", { class: "locaryn-usage-row-head" }, null, [
        el("span", {}, null, [credits.label || "Crédits"]),
        el("span", { class: "locaryn-usage-pct" }, null, [
          credits.remaining + (credits.unit ? " " + credits.unit : ""),
        ]),
      ]),
    ]);
  }

  /** Un élément qui reçoit `context` de l'hôte à chaque rendu. */
  class AvecContexte extends HTMLElement {
    set context(v) {
      var avant = this._ctx;
      this._ctx = v || {};
      if (this.isConnected) this.contexteChange(avant || {}, this._ctx);
    }
    get context() {
      return this._ctx || {};
    }
    connectedCallback() {
      this.contexteChange({}, this.context);
    }
    disconnectedCallback() {
      window.clearInterval(this._minuterie);
      this._minuterie = null;
    }
    suivre(lire) {
      window.clearInterval(this._minuterie);
      lire();
      this._minuterie = window.setInterval(lire, 60000);
    }
  }

  // ── La pastille du chat ──────────────────────────────────────────────────
  class Pastille extends AvecContexte {
    contexteChange(avantCtx, ctx) {
      var actif = ctx.remote && ctx.provider === CONFIG.provider;
      if (!actif) {
        window.clearInterval(this._minuterie);
        this._minuterie = null;
        this.usage = null;
        this.replaceChildren();
        return;
      }
      var self = this;
      var lire = function () {
        var n = (self._tour = (self._tour || 0) + 1);
        lireUsage().then(function (u) {
          if (n !== self._tour) return;
          self.usage = u;
          self.rendre();
        });
      };
      if (avantCtx.model !== ctx.model || !this._minuterie) {
        // Changer de modèle : effacer l'ancien quota tout de suite, puis relire.
        this.usage = null;
        this.ouvert = false;
        this.rendre();
        this.suivre(lire);
      } else if (avantCtx.generating && !ctx.generating) {
        // Une réponse finie a consommé du quota.
        lire();
      }
    }

    rendre() {
      var u = this.usage;
      var toutes = (u && u.windows) || [];
      if (CONFIG.filtrerParModele) toutes = pourLeModele(toutes, this.context.model);
      var fenetres = toutes.filter(aPct);
      var sansPct = toutes.filter(function (w) {
        return !aPct(w) && w.status;
      });
      if (!u || (fenetres.length === 0 && sansPct.length === 0 && !u.credits)) {
        this.replaceChildren();
        return;
      }
      var pire = fenetres.reduce(function (m, w) {
        return Math.max(m, w.used_percent);
      }, 0);
      var atteinte = sansPct.some(function (w) {
        return w.status === "rejected";
      });
      var hebdo = fenetres.filter(estHebdo)[0];
      var montre = hebdo ? hebdo.used_percent : pire;
      var texte =
        fenetres.length === 0
          ? atteinte
            ? "Quota atteint"
            : "Quota OK"
          : "Quota" + (hebdo ? " semaine " : " ") + Math.round(montre) + " %";
      var self = this;
      var bouton = el(
        "button",
        {
          type: "button",
          class: "locaryn-usage-pill is-" + (atteinte ? "danger" : niveau(pire)),
          "aria-expanded": String(!!this.ouvert),
          title: "Quota d'utilisation de " + (u.provider || CONFIG.nom) + " (pas la mémoire de la conversation) : " + texte,
        },
        null,
        [anneau(atteinte ? 100 : montre), el("span", {}, null, [texte])],
      );
      bouton.addEventListener("click", function () {
        self.ouvert = !self.ouvert;
        self.rendre();
      });
      var boite = el("div", { class: "locaryn-usage" }, null, [bouton]);
      if (this.ouvert) boite.append(this.detail(u, fenetres, sansPct));
      this.replaceChildren(boite);
      this.fermerDehors(boite);
    }

    detail(u, fenetres, sansPct) {
      var pop = el("div", { class: "locaryn-usage-pop", role: "dialog", "aria-label": "Limites d'utilisation" }, null, [
        el("div", { class: "locaryn-usage-pop-head" }, null, [
          el("strong", {}, null, [u.provider || CONFIG.nom]),
          u.plan ? el("span", {}, null, [u.plan]) : null,
        ]),
      ]);
      fenetres.concat(sansPct).forEach(function (w) {
        pop.append(ligneDetail(w, false));
      });
      if (u.credits) pop.append(ligneCredits(u.credits));
      if (u.note) pop.append(el("p", { class: "locaryn-usage-note" }, null, [u.note]));
      return pop;
    }

    fermerDehors(boite) {
      if (this._dehors) document.removeEventListener("mousedown", this._dehors);
      if (!this.ouvert) return;
      var self = this;
      this._dehors = function (e) {
        if (!boite.contains(e.target)) {
          self.ouvert = false;
          document.removeEventListener("mousedown", self._dehors);
          self.rendre();
        }
      };
      document.addEventListener("mousedown", this._dehors);
    }
  }

  // ── Le résumé sur la tuile du dossier ────────────────────────────────────
  class Resume extends AvecContexte {
    contexteChange() {
      if (this._minuterie) return;
      var self = this;
      this.suivre(function () {
        lireUsage().then(function (u) {
          self.rendre(u);
        });
      });
    }

    rendre(u) {
      var fenetres = connues(u);
      if (fenetres.length === 0 && !(u && u.credits)) {
        this.replaceChildren();
        return;
      }
      var ligne = el("div", { class: "locaryn-provider-usage-resume" });
      fenetres.forEach(function (w) {
        var court = estHebdo(w) ? "Semaine" : String(w.label).replace(/^5 heures$/, "5 h");
        var valeur = aPct(w) ? "reste " + Math.max(0, 100 - Math.round(w.used_percent)) + " %" : etatSansPourcentage(w);
        var teinte = w.status === "rejected" ? "danger" : niveau(w.used_percent || 0);
        ligne.append(el("span", { class: "locaryn-provider-usage-chip is-" + teinte }, null, [court + " " + valeur]));
      });
      if (u.credits) {
        ligne.append(
          el("span", { class: "locaryn-provider-usage-chip is-ok" }, null, [
            (u.credits.label || "Crédits") + " " + u.credits.remaining + (u.credits.unit ? " " + u.credits.unit : ""),
          ]),
        );
      }
      this.replaceChildren(ligne);
    }
  }

  // ── L'en-tête du dossier : quota et tâches de fond ───────────────────────
  var CELUI_DU_CHAT = "";

  class EnTete extends AvecContexte {
    contexteChange() {
      if (this._minuterie) return;
      var self = this;
      var a = api();
      this.carteQuota = el("div");
      this.carteTaches = el("div");
      this.replaceChildren(this.carteQuota, this.carteTaches);
      this.suivre(function () {
        lireUsage().then(function (u) {
          self.rendreQuota(u);
        });
      });
      if (!a || !a.providers || !a.providers.backgroundTasks) return;
      Promise.all([
        a.providers.backgroundTasks(CONFIG.provider),
        a.providers.models(CONFIG.provider, false).catch(function (e) {
          console.warn("[" + CONFIG.nom + "] catalogue illisible :", e);
          return [];
        }),
      ])
        .then(function (r) {
          self.reglages = r[0];
          // Seuls les modèles qui conversent savent nommer ou trier.
          self.modeles = (r[1] || []).filter(function (m) {
            return (m.kind || "chat") === "chat" && m.available !== false;
          });
          self.rendreTaches();
        })
        .catch(function (e) {
          console.warn("[" + CONFIG.nom + "] tâches de fond illisibles :", e);
        });
    }

    rendreQuota(u) {
      var fenetres = connues(u);
      if (!u || (fenetres.length === 0 && !u.credits)) {
        this.carteQuota.replaceChildren();
        return;
      }
      var grille = el("div", { class: "locaryn-provider-usage-grille" });
      fenetres.forEach(function (w) {
        grille.append(ligneDetail(w, true));
      });
      if (u.credits) grille.append(ligneCredits(u.credits));
      this.carteQuota.replaceChildren(
        el("section", { class: "locaryn-provider-usage", "aria-label": "Limites d'utilisation" }, null, [
          el("div", { class: "locaryn-provider-usage-head" }, null, [
            el("strong", {}, null, ["Ce qu'il vous reste"]),
            u.plan ? el("span", {}, null, [u.plan]) : null,
          ]),
          grille,
          u.note ? el("p", { class: "locaryn-usage-note" }, null, [u.note]) : null,
        ]),
      );
    }

    rendreTaches() {
      var r = this.reglages;
      if (!r) return;
      var self = this;
      var section = el("section", { class: "locaryn-provider-usage locaryn-bg-tasks", "aria-label": "Tâches de fond" }, null, [
        el("div", { class: "locaryn-provider-usage-head" }, null, [el("strong", {}, null, ["Tâches de fond"])]),
        this.ligne(
          "memoire",
          "Utilisation de " + CONFIG.nom + " pour la classification mémoire",
          "Coupé : la mémoire est triée par un modèle local déjà chargé, ou pas du tout. Rien n'est consommé sur ce compte.",
          "Activé : le tri de la mémoire passe par ce compte pendant les temps morts, et consomme son quota ou ses crédits.",
        ),
        this.ligne(
          "titres",
          "Utilisation de " + CONFIG.nom + " pour le nommage des conversations",
          "Coupé : les conversations sont nommées par un modèle local déjà chargé ; sinon elles gardent leur date et leur heure de début.",
          "Activé : chaque nouvelle conversation est nommée par ce compte, une courte requête qui consomme son quota ou ses crédits.",
        ),
      ]);
      if (this.erreur) section.append(el("p", { class: "locaryn-usage-note" }, null, [this.erreur]));
      self.carteTaches.replaceChildren(section);
    }

    ligne(cle, titre, coupe, actif) {
      var self = this;
      var v = this.reglages[cle] || { actif: false, modele: null };
      var bascule = el(
        "button",
        {
          type: "button",
          role: "switch",
          "aria-checked": String(!!v.actif),
          "aria-label": titre,
          class: "locaryn-switch" + (v.actif ? " locaryn-switch-on" : ""),
        },
        null,
        [el("span", { class: "locaryn-switch-knob", "aria-hidden": "true" })],
      );
      bascule.addEventListener("click", function () {
        self.poser(cle, { actif: !v.actif, modele: v.modele || null });
      });
      var bloc = el("div", { class: "locaryn-bg-task" }, null, [
        el("div", { class: "locaryn-bg-task-head" }, null, [
          el("div", { class: "locaryn-bg-task-text" }, null, [
            el("strong", {}, null, [titre]),
            el("p", {}, null, [v.actif ? actif : coupe]),
          ]),
          bascule,
        ]),
      ]);
      if (v.actif) bloc.append(this.choixModele(cle, v));
      return bloc;
    }

    choixModele(cle, v) {
      var self = this;
      var choix = el("select", { class: "locaryn-select", "aria-label": "Modèle utilisé" }, null, [
        el("option", { value: CELUI_DU_CHAT }, null, ["Le modèle de la conversation"]),
      ]);
      this.modeles.forEach(function (m) {
        choix.append(el("option", { value: m.id }, null, [m.name || m.id]));
      });
      choix.value = v.modele || CELUI_DU_CHAT;
      choix.addEventListener("change", function () {
        self.poser(cle, { actif: true, modele: choix.value === CELUI_DU_CHAT ? null : choix.value });
      });
      return el("label", { class: "locaryn-bg-task-model" }, null, [el("span", {}, null, ["Avec"]), choix]);
    }

    poser(cle, valeur) {
      var self = this;
      var avantR = this.reglages;
      var suite = Object.assign({}, avantR);
      suite[cle] = valeur;
      this.reglages = suite;
      this.erreur = null;
      this.rendreTaches();
      api()
        .providers.setBackgroundTasks(CONFIG.provider, suite)
        .catch(function (e) {
          self.reglages = avantR;
          self.erreur = "Réglage non enregistré : " + (e && e.message ? e.message : String(e));
          self.rendreTaches();
        });
    }
  }

  function definir(suffixe, classe) {
    var tag = CONFIG.prefixe + "-" + suffixe;
    if (!customElements.get(tag)) customElements.define(tag, classe);
  }
  definir("quota-pill", Pastille);
  definir("quota-summary", Resume);
  definir("folder-header", EnTete);
})();

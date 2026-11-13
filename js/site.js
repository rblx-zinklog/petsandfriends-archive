/* ==========================================================================
   Pets & Friends Archive — site.js
   Loaded on every page. It:
     1. builds the shared header, navigation, sidebar and footer,
     2. loads data/documents.json once,
     3. fills the home page (recent publications, categories),
     4. wraps each publication page with its title, date, category, etc.

   To change the site name, navigation, footer text or page size,
   edit CONFIG below.
   ========================================================================== */
(function () {
  "use strict";

  var script = document.currentScript;
  // The site root, worked out from where this script lives (<root>/js/site.js).
  // This makes every link work from the root AND from the /documents/ folder.
  var BASE = new URL("../", script.src).href;

  var CONFIG = {
    siteName: "Pets & Friends Archive",
    tagline: "The official archive of all pets and friends alike.",
    established: 2026,
    footerNote: "All writings in this archive are original works by the authors. Do not copy or republish them without permission.",
    dataFile: "data/documents.json",
    logo: { src: "assets/logo.png", width: 1040, height: 230 },
    recentCount: 6,   // "Recently published" items on the home page
    pageSize: 20,     // publications per page in the catalogue and search
    nav: [
      { id: "home",      label: "Home",      href: "index.html" },
      { id: "catalogue", label: "Catalogue", href: "catalogue.html" },
      { id: "search",    label: "Search",    href: "search.html" },
      { id: "about",     label: "About",     href: "about.html" }
    ]
  };

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  function url(path) { return new URL(path, BASE).href; }

  // Create an element: el("a", {href: "x", text: "Hello"}, [child, "text"])
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else node.setAttribute(key, value === true ? "" : value);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  // Lower-case and strip accents so "Café" matches "cafe".
  function fold(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function titleCase(s) {
    return String(s).replace(/[-_]+/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  // "documents/The-Cat.html" -> "the-cat"
  function slugOf(path) {
    return String(path).split("?")[0].split("#")[0].split("/").pop().replace(/\.html?$/i, "").toLowerCase();
  }

  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  }

  function formatDate(s) {
    var d = parseDate(s);
    if (!d) return s || "";
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }

  // Append `text` to `node`, wrapping any of `terms` (already folded) in <mark>.
  function appendHighlighted(node, text, terms) {
    var folded = terms && terms.length ? fold(text) : "";
    if (!terms || !terms.length || folded.length !== text.length) {
      node.appendChild(document.createTextNode(text));
      return;
    }
    var sorted = terms.slice().sort(function (a, b) { return b.length - a.length; });
    var re = new RegExp(sorted.map(escapeRegExp).join("|"), "g");
    var last = 0, m;
    while ((m = re.exec(folded)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
      node.appendChild(el("mark", { text: text.slice(m.index, m.index + m[0].length) }));
      last = m.index + m[0].length;
    }
    if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
  }

  /* ------------------------------------------------------------------ *
   * Loading documents.json
   * ------------------------------------------------------------------ */

  function byDateDesc(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.title.localeCompare(b.title);
  }

  function normalise(raw) {
    var categories = [], catMap = {}, docs = [];

    (raw.categories || []).forEach(function (c) {
      if (!c || !c.id) return;
      var cat = { id: String(c.id), name: c.name || titleCase(c.id), description: c.description || "", count: 0 };
      categories.push(cat);
      catMap[cat.id] = cat;
    });

    (raw.documents || []).forEach(function (d, i) {
      if (!d || !d.title || !d.file) {
        console.warn("documents.json: entry #" + (i + 1) + " needs at least a title and a file.", d);
        return;
      }
      var catId = d.category ? String(d.category) : "uncategorised";
      if (!catMap[catId]) {   // unknown category: create it on the fly
        catMap[catId] = { id: catId, name: titleCase(catId), description: "", count: 0 };
        categories.push(catMap[catId]);
      }
      catMap[catId].count++;
      docs.push({
        title: String(d.title),
        description: String(d.description || ""),
        category: catId,
        categoryName: catMap[catId].name,
        date: String(d.date || ""),
        file: String(d.file),
        tags: (d.tags || []).map(String),
        slug: slugOf(d.file),
        href: url(d.file)
      });
    });

    docs.sort(byDateDesc);
    return { categories: categories, catMap: catMap, docs: docs };
  }

  var ready = fetch(url(CONFIG.dataFile), { cache: "no-cache" })
    .then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    })
    .then(normalise);

  /* ------------------------------------------------------------------ *
   * Shared pieces: entries, tags
   * ------------------------------------------------------------------ */

  function catalogueUrl(params) {
    var qs = Object.keys(params).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&");
    return url("catalogue.html") + (qs ? "?" + qs : "");
  }

  function tagLinks(tags) {
    var out = [];
    tags.forEach(function (t) {
      if (out.length) out.push(" ");
      out.push(el("a", { class: "tag", href: catalogueUrl({ tag: t }), text: t }));
    });
    return out;
  }

  function renderEntry(doc, opts) {
    opts = opts || {};
    var terms = opts.terms || [];
    var link = el("a", { href: doc.href });
    appendHighlighted(link, doc.title, terms);

    var meta = el("p", { class: "entry-meta" }, [
      el("a", { class: "cat-tag", href: catalogueUrl({ cat: doc.category }), text: doc.categoryName }),
      doc.date ? el("span", { text: formatDate(doc.date) }) : null
    ]);

    var kids = [el("h3", { class: "entry-title" }, [link]), meta];

    if (doc.description) {
      var desc = el("p", { class: "entry-desc" });
      appendHighlighted(desc, doc.description, terms);
      kids.push(desc);
    }
    if (doc.tags.length && opts.showTags !== false) {
      kids.push(el("p", { class: "entry-tags" }, ["Tags: "].concat(tagLinks(doc.tags))));
    }
    return el("article", { class: "entry" }, kids);
  }

  /* ------------------------------------------------------------------ *
   * Page layout (header, nav, sidebar, footer)
   * ------------------------------------------------------------------ */

  function box(title, kids) {
    return el("section", { class: "box" }, [el("h2", { text: title }), el("div", { class: "box-body" }, kids)]);
  }

  function buildLayout(page) {
    var main = document.getElementById("page-content");
    if (!main) return;
    var activeId = page === "document" ? "catalogue" : page;

    var skip = el("a", { class: "skip-link", href: "#page-content", text: "Skip to content" });

    var header = el("header", { class: "masthead" }, [
      el("a", { class: "logo-link", href: url("index.html") }, [
        el("img", { src: url(CONFIG.logo.src), alt: CONFIG.siteName, width: CONFIG.logo.width, height: CONFIG.logo.height })
      ]),
      el("p", { class: "tagline", text: CONFIG.tagline })
    ]);

    var navItems = CONFIG.nav.map(function (item) {
      var active = item.id === activeId;
      return el("li", null, [
        el("a", { href: url(item.href), class: active ? "active" : null, "aria-current": active ? "page" : null, text: item.label })
      ]);
    });
    var nav = el("nav", { class: "main-nav", "aria-label": "Main" }, [el("ul", null, navItems)]);

    var searchForm = el("form", { class: "mini-search", action: url("search.html"), method: "get", role: "search" }, [
      el("label", { class: "sr-only", for: "side-q", text: "Search the archive" }),
      el("input", { type: "search", id: "side-q", name: "q", placeholder: "Search…" }),
      el("button", { type: "submit", class: "btn", text: "Go" })
    ]);

    var sidebar = el("aside", { class: "sidebar", "aria-label": "Sidebar" }, [
      box("Search", [searchForm]),
      box("Categories", [el("ul", { class: "side-list", id: "side-categories" }, [el("li", { class: "loading", text: "Loading…" })])]),
      box("The Archive", [el("dl", { class: "side-stats", id: "side-stats" }, [el("dd", { class: "loading", text: "Loading…" })])])
    ]);

    var year = new Date().getFullYear();
    var years = CONFIG.established >= year ? String(year) : CONFIG.established + "–" + year;
    var footer = el("footer", { class: "site-footer" }, [
      el("p", { text: "© " + years + " " + CONFIG.siteName }),
      el("p", { text: CONFIG.footerNote })
    ]);

    var layout = el("div", { class: "layout" });
    var wrap = el("div", { class: "site-wrap" }, [header, nav, layout, footer]);

    document.body.insertBefore(skip, document.body.firstChild);
    document.body.insertBefore(wrap, main);
    layout.appendChild(main);
    layout.appendChild(sidebar);
  }

  function fillSidebar(data) {
    var list = document.getElementById("side-categories");
    if (list) {
      list.textContent = "";
      list.appendChild(el("li", null, [
        el("a", { href: catalogueUrl({}), text: "All publications" }),
        " ", el("span", { class: "count", text: "(" + data.docs.length + ")" })
      ]));
      data.categories.forEach(function (c) {
        list.appendChild(el("li", null, [
          el("a", { href: catalogueUrl({ cat: c.id }), text: c.name }),
          " ", el("span", { class: "count", text: "(" + c.count + ")" })
        ]));
      });
    }

    var stats = document.getElementById("side-stats");
    if (stats) {
      stats.textContent = "";
      var latest = data.docs.length ? formatDate(data.docs[0].date) : "—";
      [["Publications", String(data.docs.length)], ["Categories", String(data.categories.length)], ["Last added", latest]]
        .forEach(function (row) {
          stats.appendChild(el("dt", { text: row[0] }));
          stats.appendChild(el("dd", { text: row[1] }));
        });
    }
  }

  /* ------------------------------------------------------------------ *
   * Widgets: any element with data-archive="..." is filled automatically.
   *   recent       latest publications     (data-count="6" to override)
   *   categories   category cards
   *   count        number of publications
   *   latest-date  date of the newest publication
   * ------------------------------------------------------------------ */

  function fillWidgets(data) {
    var nodes = document.querySelectorAll("[data-archive]");
    Array.prototype.forEach.call(nodes, function (node) {
      var kind = node.getAttribute("data-archive");

      if (kind === "recent") {
        var n = parseInt(node.getAttribute("data-count"), 10) || CONFIG.recentCount;
        node.textContent = "";
        if (!data.docs.length) node.appendChild(el("p", { class: "hint", text: "Nothing has been published yet. Check back soon." }));
        data.docs.slice(0, n).forEach(function (d) { node.appendChild(renderEntry(d)); });

      } else if (kind === "categories") {
        node.textContent = "";
        data.categories.forEach(function (c) {
          node.appendChild(el("div", { class: "cat-card" }, [
            el("h3", null, [el("a", { href: catalogueUrl({ cat: c.id }), text: c.name })]),
            el("span", { class: "count", text: c.count + (c.count === 1 ? " publication" : " publications") }),
            c.description ? el("p", { text: c.description }) : null
          ]));
        });

      } else if (kind === "count") {
        node.textContent = String(data.docs.length);

      } else if (kind === "latest-date") {
        node.textContent = data.docs.length ? formatDate(data.docs[0].date) : "—";
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Publication pages
   * ------------------------------------------------------------------ */

  function renderDocument(data) {
    var main = document.getElementById("page-content");
    var article = main && main.querySelector(".document-body");
    if (!article) return;

    var override = document.body.getAttribute("data-doc-id");
    var slug = (override || slugOf(safeDecode(location.pathname))).toLowerCase();
    var doc = null;
    for (var i = 0; i < data.docs.length; i++) {
      if (data.docs[i].slug === slug) { doc = data.docs[i]; break; }
    }

    var title = doc ? doc.title : document.title.split(" — ")[0];
    if (doc) document.title = doc.title + " — " + CONFIG.siteName;

    var words = (article.textContent.trim().match(/\S+/g) || []).length;
    var minutes = Math.max(1, Math.round(words / 200));

    // Breadcrumb
    var crumbs = [
      el("a", { href: url("index.html"), text: "Home" }), " › ",
      el("a", { href: url("catalogue.html"), text: "Catalogue" })
    ];
    if (doc) crumbs.push(" › ", el("a", { href: catalogueUrl({ cat: doc.category }), text: doc.categoryName }));

    // Meta line
    var metaBits = [];
    if (doc && doc.date) metaBits.push(el("span", { text: "Published " + formatDate(doc.date) }));
    if (doc) metaBits.push(el("span", null, [el("a", { class: "cat-tag", href: catalogueUrl({ cat: doc.category }), text: doc.categoryName })]));
    metaBits.push(el("span", { text: "About " + minutes + " min read" }));

    // Text-size and print tools
    var SIZES = [0.95, 1.05, 1.15, 1.3, 1.5];
    var size = 2;
    try {
      var saved = parseInt(localStorage.getItem("pfa-text-size"), 10);
      if (saved >= 0 && saved < SIZES.length) size = saved;
    } catch (e) { /* storage unavailable: use the default */ }

    function applySize() {
      article.style.fontSize = SIZES[size] + "rem";
      try { localStorage.setItem("pfa-text-size", String(size)); } catch (e) { /* ignore */ }
    }
    function sizeButton(label, aria, delta) {
      var b = el("button", { type: "button", class: "btn btn-small", "aria-label": aria, text: label });
      b.addEventListener("click", function () {
        size = Math.min(SIZES.length - 1, Math.max(0, size + delta));
        applySize();
      });
      return b;
    }
    var printBtn = el("button", { type: "button", class: "btn btn-small", text: "Print" });
    printBtn.addEventListener("click", function () { window.print(); });
    applySize();

    var headerKids = [
      el("nav", { class: "breadcrumb", "aria-label": "Breadcrumb" }, crumbs),
      el("h1", { text: title }),
      el("p", { class: "doc-meta" }, metaBits)
    ];
    if (doc && doc.description) headerKids.push(el("p", { class: "doc-desc", text: doc.description }));
    if (!doc) {
      headerKids.push(el("p", { class: "notice", text: "This page is not listed in data/documents.json yet, so it will not appear in the catalogue or in search results." }));
    }
    headerKids.push(el("div", { class: "reader-tools" }, [
      el("span", { class: "label", text: "Text size" }),
      sizeButton("A−", "Smaller text", -1),
      sizeButton("A+", "Larger text", 1),
      printBtn
    ]));
    article.parentNode.insertBefore(el("header", { class: "doc-header" }, headerKids), article);

    // After the text: tags + older / newer in the same category
    var footKids = [el("div", { class: "ornament", "aria-hidden": "true", text: "❦" })];
    if (doc && doc.tags.length) footKids.push(el("p", { class: "entry-tags" }, ["Tags: "].concat(tagLinks(doc.tags))));

    var navKids = [];
    if (doc) {
      var same = data.docs.filter(function (d) { return d.category === doc.category; });
      var idx = same.indexOf(doc);
      var newer = same[idx - 1], older = same[idx + 1];
      navKids.push(el("div", { class: "prev" }, older ? [
        "← Older in " + doc.categoryName + ": ", el("a", { href: older.href, text: older.title })
      ] : []));
      navKids.push(el("div", { class: "next" }, newer ? [
        "Newer in " + doc.categoryName + ": ", el("a", { href: newer.href, text: newer.title }), " →"
      ] : []));
    }
    navKids.push(el("div", { class: "back" }, [el("a", { href: url("catalogue.html"), text: "« Back to the catalogue" })]));
    footKids.push(el("nav", { class: "doc-nav", "aria-label": "More publications" }, navKids));

    article.parentNode.insertBefore(el("footer", { class: "doc-footer" }, footKids), article.nextSibling);
  }

  /* ------------------------------------------------------------------ *
   * Errors
   * ------------------------------------------------------------------ */

  function showLoadError() {
    var main = document.getElementById("page-content");
    if (!main) return;
    Array.prototype.forEach.call(document.querySelectorAll(".loading"), function (n) { n.textContent = "Unavailable."; });
    var msg = location.protocol === "file:"
      ? "The catalogue could not be loaded. Browsers block data files when a page is opened straight from your computer. Run a local web server (see README.md), or view the site once it is uploaded."
      : "The catalogue could not be loaded (data/documents.json is missing or contains an error). Please try again later.";
    main.insertBefore(el("div", { class: "notice notice-error", role: "alert", text: msg }), main.firstChild);
  }

  /* ------------------------------------------------------------------ *
   * Start-up
   * ------------------------------------------------------------------ */

  window.Archive = {
    config: CONFIG, ready: ready,
    url: url, el: el, fold: fold, formatDate: formatDate,
    renderEntry: renderEntry, appendHighlighted: appendHighlighted, catalogueUrl: catalogueUrl
  };

  function init() {
    var page = document.body.getAttribute("data-page") || "";
    buildLayout(page);
    ready.then(function (data) {
      fillSidebar(data);
      fillWidgets(data);
      if (page === "document") renderDocument(data);
    }).catch(function (err) {
      console.error("Pets & Friends Archive:", err);
      showLoadError();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

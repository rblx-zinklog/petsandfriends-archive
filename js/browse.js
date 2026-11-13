/* ==========================================================================
   Pets & Friends Archive — browse.js
   Powers catalogue.html and search.html: free-text search, category / year /
   tag filters, sorting and pagination. Needs js/site.js loaded first.
   The page state lives in the URL (?q=cats&cat=stories&p=2) so any result
   page can be bookmarked or shared.
   ========================================================================== */
(function () {
  "use strict";

  var A = window.Archive;
  var page = document.body.getAttribute("data-page");
  var root = document.getElementById("browser");
  if (!A || !root || (page !== "catalogue" && page !== "search")) return;

  var el = A.el, fold = A.fold;
  var PAGE_SIZE = A.config.pageSize || 20;

  A.ready.then(init, function () { /* site.js shows the error message */ });

  function init(data) {
    var docs = data.docs;

    // Pre-compute lower-cased, accent-free copies for fast matching.
    docs.forEach(function (d) {
      d._title = fold(d.title);
      d._desc = fold(d.description);
      d._cat = fold(d.categoryName);
      d._tags = d.tags.map(fold);
      d._year = (d.date || "").slice(0, 4);
    });

    var state = readState();

    /* ---------- Build the form ---------- */

    var qInput = el("input", { type: "search", id: "f-q", name: "q", placeholder: "Title, subject or keyword…", autocomplete: "off" });

    var catSel = el("select", { id: "f-cat", name: "cat" }, [el("option", { value: "", text: "All categories (" + docs.length + ")" })]);
    data.categories.forEach(function (c) {
      catSel.appendChild(el("option", { value: c.id, text: c.name + " (" + c.count + ")" }));
    });

    var years = {};
    docs.forEach(function (d) { if (d._year) years[d._year] = true; });
    var yearSel = el("select", { id: "f-year", name: "year" }, [el("option", { value: "", text: "Any year" })]);
    Object.keys(years).sort().reverse().forEach(function (y) { yearSel.appendChild(el("option", { value: y, text: y })); });

    var sortSel = el("select", { id: "f-sort", name: "sort" }, [
      el("option", { value: "newest",    text: "Newest first" }),
      el("option", { value: "oldest",    text: "Oldest first" }),
      el("option", { value: "az",        text: "Title (A–Z)" }),
      el("option", { value: "za",        text: "Title (Z–A)" }),
      el("option", { value: "relevance", text: "Best match" })
    ]);

    var resetBtn = el("button", { type: "button", class: "btn", text: "Reset" });
    var form = el("form", { class: "filter-form", role: "search", "aria-label": "Search and filter" }, [
      el("div", { class: "field field-q" }, [el("label", { for: "f-q", text: "Search" }), qInput]),
      el("div", { class: "field" }, [el("label", { for: "f-cat", text: "Category" }), catSel]),
      el("div", { class: "field" }, [el("label", { for: "f-year", text: "Year" }), yearSel]),
      el("div", { class: "field" }, [el("label", { for: "f-sort", text: "Sort by" }), sortSel]),
      el("div", { class: "buttons" }, [el("button", { type: "submit", class: "btn", text: page === "search" ? "Search" : "Filter" }), resetBtn])
    ]);

    var head = el("div", { class: "results-head" });
    var summary = el("p", { class: "summary", "aria-live": "polite" });
    var chips = el("span", { class: "chips" });
    head.appendChild(summary);
    head.appendChild(chips);
    var blurb = el("div");
    var results = el("div", { id: "results" });
    var pagerBox = el("div");

    root.textContent = "";
    [form, head, blurb, results, pagerBox].forEach(function (n) { root.appendChild(n); });

    /* ---------- State <-> URL ---------- */

    function readState() {
      var ps = new URLSearchParams(location.search);
      return {
        q: ps.get("q") || "", cat: ps.get("cat") || "", year: ps.get("year") || "",
        tag: ps.get("tag") || "", sort: ps.get("sort") || "",
        p: Math.max(1, parseInt(ps.get("p"), 10) || 1)
      };
    }

    function writeState() {
      var ps = new URLSearchParams();
      ["q", "cat", "year", "tag", "sort"].forEach(function (k) { if (state[k]) ps.set(k, state[k]); });
      if (state.p > 1) ps.set("p", state.p);
      var qs = ps.toString();
      try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "")); } catch (e) { /* e.g. file:// */ }
    }

    function syncControls() {
      qInput.value = state.q;
      catSel.value = state.cat;
      if (catSel.value !== state.cat) { state.cat = ""; catSel.value = ""; }
      yearSel.value = state.year;
      if (yearSel.value !== state.year) { state.year = ""; yearSel.value = ""; }
    }

    /* ---------- Searching ---------- */

    // "grey cat" "lighthouse" -> terms [grey, cat], phrases [lighthouse]
    function parseQuery(q) {
      var terms = [], phrases = [], re = /"([^"]+)"|(\S+)/g, m, s = fold(q);
      while ((m = re.exec(s)) !== null) {
        if (m[1]) { if (m[1].trim()) phrases.push(m[1].trim()); }
        else {
          var t = m[2].replace(/"/g, "");
          if (t) terms.push(t);
        }
      }
      return { terms: terms, phrases: phrases, all: phrases.concat(terms) };
    }

    function wordStart(text, t) {
      return new RegExp("(^|[^a-z0-9])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(text);
    }

    // Every term must be found somewhere; returns 0 if any term is missing.
    function score(d, pq) {
      var total = 0;
      for (var i = 0; i < pq.all.length; i++) {
        var t = pq.all[i], s = 0;
        if (d._title.indexOf(t) !== -1) {
          s += 10;
          if (wordStart(d._title, t)) s += 4;
          if (d._title === t) s += 10;
        }
        for (var j = 0; j < d._tags.length; j++) {
          if (d._tags[j] === t) s += 8;
          else if (d._tags[j].indexOf(t) !== -1) s += 4;
        }
        if (d._cat.indexOf(t) !== -1) s += 3;
        if (d._desc.indexOf(t) !== -1) s += 2;
        if (s === 0) return 0;
        total += s;
      }
      return total;
    }

    function byDate(a, b) {
      if (a.d.date !== b.d.date) return a.d.date < b.d.date ? 1 : -1;
      return a.d.title.localeCompare(b.d.title);
    }
    var sorters = {
      relevance: function (a, b) { return (b.s - a.s) || byDate(a, b); },
      newest: byDate,
      oldest: function (a, b) { return -byDate(a, b) || a.d.title.localeCompare(b.d.title); },
      az: function (a, b) { return a.d.title.localeCompare(b.d.title); },
      za: function (a, b) { return b.d.title.localeCompare(a.d.title); }
    };

    /* ---------- Rendering ---------- */

    function render() {
      var pq = parseQuery(state.q);
      var hasQuery = pq.all.length > 0;
      var hasFilter = hasQuery || state.cat || state.year || state.tag;

      summary.textContent = "";
      chips.textContent = "";
      blurb.textContent = "";
      results.textContent = "";
      pagerBox.textContent = "";

      var sort = state.sort && sorters[state.sort] ? state.sort : (hasQuery ? "relevance" : "newest");
      if (sort === "relevance" && !hasQuery) sort = "newest";
      sortSel.value = sort;

      if (page === "search" && !hasFilter) { renderIntro(); return; }

      var tagKey = fold(state.tag), rows = [];
      docs.forEach(function (d) {
        if (state.cat && d.category !== state.cat) return;
        if (state.year && d._year !== state.year) return;
        if (state.tag && d._tags.indexOf(tagKey) === -1) return;
        var s = 0;
        if (hasQuery) { s = score(d, pq); if (!s) return; }
        rows.push({ d: d, s: s });
      });
      rows.sort(sorters[sort]);

      var total = rows.length;
      var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (state.p > pages) state.p = pages;
      var from = (state.p - 1) * PAGE_SIZE;
      var to = Math.min(total, from + PAGE_SIZE);

      var text = total === 0 ? "No publications found"
        : pages > 1 ? "Showing " + (from + 1) + "–" + to + " of " + total + " publications"
        : total + (total === 1 ? " publication" : " publications");
      if (hasQuery) text += " matching “" + state.q.replace(/"/g, "").trim() + "”";
      summary.textContent = text + ".";

      if (state.tag) {
        var x = el("button", { type: "button", "aria-label": "Remove tag filter", text: "×" });
        x.addEventListener("click", function () { state.tag = ""; state.p = 1; writeState(); render(); });
        chips.appendChild(el("span", { class: "chip" }, ["Tag: " + state.tag, x]));
      }

      if (state.cat && data.catMap[state.cat] && data.catMap[state.cat].description) {
        blurb.appendChild(el("p", { class: "cat-blurb", text: data.catMap[state.cat].description }));
      }

      if (total === 0) {
        var again = el("button", { type: "button", class: "btn", text: "Clear all filters" });
        again.addEventListener("click", resetAll);
        results.appendChild(el("div", { class: "empty" }, [
          el("p", { text: "Nothing matched. Try fewer or shorter words, or remove a filter." }), again
        ]));
        return;
      }

      rows.slice(from, to).forEach(function (r) {
        results.appendChild(A.renderEntry(r.d, { terms: pq.all }));
      });
      renderPager(pages);
    }

    function renderIntro() {
      results.appendChild(el("p", { class: "hint", text: "Type a word or phrase above to search titles, descriptions, categories and tags. Put quotation marks around words to find an exact phrase." }));

      var counts = {};
      docs.forEach(function (d) {
        d.tags.forEach(function (t) {
          var k = fold(t);
          if (!counts[k]) counts[k] = { label: t, n: 0 };
          counts[k].n++;
        });
      });
      var list = Object.keys(counts).map(function (k) { return counts[k]; });
      if (!list.length) return;
      list.sort(function (a, b) { return b.n - a.n || a.label.localeCompare(b.label); });
      list = list.slice(0, 80);
      var max = list[0].n, min = list[list.length - 1].n;
      list.sort(function (a, b) { return a.label.localeCompare(b.label); });

      var cloud = el("p", { class: "tag-cloud" });
      list.forEach(function (t) {
        var size = 0.9 + (max === min ? 0.2 : 0.7 * (t.n - min) / (max - min));
        var a = el("a", { href: A.url("search.html") + "?tag=" + encodeURIComponent(t.label), title: t.n + (t.n === 1 ? " publication" : " publications"), text: t.label });
        a.style.fontSize = size.toFixed(2) + "rem";
        cloud.appendChild(a);
        cloud.appendChild(document.createTextNode(" "));
      });
      results.appendChild(el("h2", { text: "Browse by tag" }));
      results.appendChild(cloud);
    }

    function renderPager(pages) {
      if (pages < 2) return;
      var nav = el("nav", { class: "pager", "aria-label": "Pagination" });
      nav.appendChild(pageButton("« Previous", state.p - 1, state.p === 1, false));
      pageWindow(state.p, pages).forEach(function (n) {
        if (n === "…") nav.appendChild(el("span", { class: "gap", text: "…" }));
        else nav.appendChild(pageButton(String(n), n, false, n === state.p));
      });
      nav.appendChild(pageButton("Next »", state.p + 1, state.p === pages, false));
      pagerBox.appendChild(nav);
    }

    function pageButton(label, n, disabled, current) {
      var b = el("button", {
        type: "button", class: "page-btn" + (current ? " current" : ""),
        disabled: disabled, "aria-current": current ? "page" : null, text: label
      });
      b.addEventListener("click", function () {
        state.p = n; writeState(); render();
        window.scrollTo(0, results.getBoundingClientRect().top + window.pageYOffset - 20);
      });
      return b;
    }

    // 1 … 4 5 [6] 7 8 … 20
    function pageWindow(cur, total) {
      var set = {};
      set[1] = true; set[total] = true;
      for (var i = cur - 2; i <= cur + 2; i++) if (i >= 1 && i <= total) set[i] = true;
      var nums = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
      var out = [], prev = 0;
      nums.forEach(function (n) { if (n - prev > 1) out.push("…"); out.push(n); prev = n; });
      return out;
    }

    /* ---------- Events ---------- */

    function applyControls() {
      state.q = qInput.value;
      state.cat = catSel.value;
      state.year = yearSel.value;
      state.p = 1;
      writeState();
      render();
    }

    function resetAll() {
      state = { q: "", cat: "", year: "", tag: "", sort: "", p: 1 };
      syncControls();
      writeState();
      render();
    }

    var timer = null;
    qInput.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(applyControls, 150); });
    catSel.addEventListener("change", applyControls);
    yearSel.addEventListener("change", applyControls);
    sortSel.addEventListener("change", function () { state.sort = sortSel.value; state.p = 1; writeState(); render(); });
    form.addEventListener("submit", function (e) { e.preventDefault(); clearTimeout(timer); applyControls(); });
    resetBtn.addEventListener("click", resetAll);

    syncControls();
    render();
    if (page === "search" && !state.q && window.matchMedia && window.matchMedia("(pointer: fine)").matches) qInput.focus();
  }
})();

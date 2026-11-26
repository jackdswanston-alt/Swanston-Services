(function(){
  "use strict";

  var DEFAULTS = {
    r_crewrate: 28, r_crewmin: 250, r_crewfloor: 20,
    r_you: 45, r_mgmt: 3, r_superv: 1.5,
    r_truck: 65, r_saw: 35, r_mob: 120,
    r_margin: 40, r_min: 450, r_tree: 85
  };
  var RATE_IDS = Object.keys(DEFAULTS);

  // Everything the tool assumes lives here and every bit of it is editable
  // under Customize. Nothing below is hardcoded anywhere else.
  function cfgDefaults(){
    return {
      depths: [6, 10, 15],
      trailerYd: 11,
      treeHours: 0.75,
      loadHours: 0.6,
      stackHours: 1.2,
      extreme: 1.35,
      terrain2: 1.15,
      terrain3: 1.35,
      density: [
        {key:"light",  label:'Light \u2014 weeds, saplings under 1"', words:"light brush and saplings",      cut:250, vol:1.5},
        {key:"medium", label:'Medium \u2014 brush 1\u20133", briars', words:"mixed brush, briars and saplings", cut:120, vol:3},
        {key:"heavy",  label:'Heavy \u2014 dense 3\u20136", tangled', words:"dense brush and small trees",     cut:60,  vol:5},
        {key:"cedar",  label:"Cedar-choked",                      words:"heavy cedar and undergrowth",    cut:35,  vol:7}
      ],
      sites: [
        {key:"driftwood",  name:"Driftwood",  full:"Hays County Driftwood Recycling", perYd:30.00, min:10,   cap:0, closed:"Sun & Mon"},
        {key:"creedmoor",  name:"Creedmoor",  full:"TDS Creedmoor",                   perYd:10.00, min:20,   cap:0, closed:""},
        {key:"georgetown", name:"Georgetown", full:"",                                perYd:8.25,  min:8.25, cap:0, closed:""},
        {key:"beecave",    name:"Bee Cave",   full:"",                                perYd:15.00, min:15,   cap:0, closed:""},
        {key:"hornsby",    name:"Hornsby",    full:"",                                perYd:9.80,  min:0,    cap:6, closed:""}
      ],
      brand: {
        company: "SWANSTON SERVICES",
        tagline: "Cut. Clear. Haul.",
        phone: "(512) 902-3213",
        web: "swanstonservices.com",
        accent: "#A65E0C",
        validDays: 30,
        scope: "Clearing the {len} ft run behind your fence, {depth} ft back \u2014 {density}, cut to ground level and left walkable.",
        inc: ["Brush, briars, saplings and deadfall cut out"],
        exc: ["Stump grinding or removal", "Anything beyond the measured run above"],
        haulAll:  ["Every bit of it loaded and hauled off site", "No pile, no debris left behind"],
        haulPart: ["Everything that needs hauling loaded and taken off site", "Fine growth cut down and left in place"],
        haulNone: ["Everything cut down and left on site"],
        haulNoneExc: ["Haul-off \u2014 nothing is taken away"],
        guarantee: "If it is not done to the standard we agreed, we come back and redo it free",
        showGuarantee: true,
        terms: "Buried debris, extra trees or work beyond the measured run would be quoted separately before anything is done.",
        covTitle: "WHAT THIS PRICE COVERS",
        rowLabor: "Labor",
        rowMaterials: "Materials",
        rowDump: "Dump and haul-off",
        redLabel: "Reduction",
        showCovers: true,
        atCost: true
      },
      rates: JSON.parse(JSON.stringify(DEFAULTS))
    };
  }

  var CFG = cfgDefaults();

  function densByKey(k){
    for (var i = 0; i < CFG.density.length; i++) if (CFG.density[i].key === k) return CFG.density[i];
    return null;
  }
  function siteByKey(k){
    for (var i = 0; i < CFG.sites.length; i++) if (CFG.sites[i].key === k) return CFG.sites[i];
    return null;
  }
  function hexRgb(h){
    var m = /^#?([0-9a-f]{6})$/i.exec(String(h || "").trim());
    if (!m) return [166, 94, 12];
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function lines(t){
    return String(t || "").split("\n").map(function(x){ return x.trim(); })
      .filter(function(x){ return x.length > 0; });
  }

  var selected = 1;              // middle band by default

  function $(id){ return document.getElementById(id); }
  function money(n){ return "$" + Math.round(n).toLocaleString("en-US"); }

  function readRates(){
    var r = {};
    RATE_IDS.forEach(function(k){
      var el = $(k), v = el ? parseFloat(el.value) : NaN;
      r[k] = isFinite(v) ? v : DEFAULTS[k];
    });
    return r;
  }

  function dumpCost(site, volume){
    if (volume <= 0) return 0;
    return Math.max(volume * site.perYd, site.min);
  }

  function compute(depth){
    var len = parseFloat($("len").value) || 0;
    var area = len * depth;
    var d = densByKey($("dens").value);
    var access = parseFloat($("access").value) || 1;
    var terrain = parseFloat($("terrain").value) || 1;
    var trees = Math.max(0, parseInt($("trees").value, 10) || 0);
    var crew = Math.max(1, parseInt($("crew").value, 10) || 1);
    var haulChoice = $("haulAny").value;
    var site = siteByKey($("site").value);
    var tripMin = Math.max(0, parseFloat($("roundtrip").value) || 0);

    // what still has to be filled in before a price means anything
    var missing = [];
    if (!(len > 0)) missing.push("fence line");
    if (!d) missing.push("density");
    if (haulChoice === "") missing.push("whether you are hauling");
    if (haulChoice === "1" && !site) missing.push("dump site");
    if (missing.length) return {ready:false, missing:missing, depth:depth, crew:crew};

    site = site || CFG.sites[0];
    var r = readRates();

    var hauled = haulChoice === "0"
      ? 0
      : Math.min(1, Math.max(0, (parseFloat($("haulPct").value) || 0) / 100));

    var cutHours = area > 0 ? (area / d.cut) * access * terrain : 0;
    var treeHours = trees * CFG.treeHours;
    var volume = (area / 100) * d.vol;          // everything cut
    var haulVol = volume * hauled;              // what actually leaves
    // stacking what stays costs a little time, but far less than loading it
    var stackHours = (volume - haulVol) / 100 * CFG.stackHours;
    var loads = haulVol > 0 ? Math.ceil(haulVol / CFG.trailerYd) : 0;
    var haulHours = loads * (tripMin / 60) * crew + loads * CFG.loadHours * crew + stackHours;

    var manHours = cutHours + treeHours + haulHours;
    var crewHours = manHours / crew;
    var days = crewHours / 8;

    var suggestedPay = Math.max(manHours * r.r_crewrate, manHours > 0 ? r.r_crewmin : 0);
    var override = parseFloat($("crewpay").value);
    var crewPay = (isFinite(override) && override > 0) ? override : suggestedPay;
    var effRate = manHours > 0 ? crewPay / manHours : 0;

    var mgmtHours = r.r_mgmt + Math.max(0, days) * r.r_superv;
    var mgmtCost = mgmtHours * r.r_you;
    var equip = Math.max(1, Math.ceil(days)) * (r.r_truck + r.r_saw);
    var dumpFee = dumpCost(site, haulVol);

    var bestAlt = null;
    CFG.sites.forEach(function(s){
      if (s === site) return;
      if (s.cap > 0 && haulVol > s.cap) return;
      var c = dumpCost(s, haulVol);
      if (bestAlt === null || c < bestAlt.cost) bestAlt = {site:s, cost:c};
    });

    var cost = crewPay + mgmtCost + equip + dumpFee + r.r_mob;
    var margin = Math.min(Math.max(r.r_margin, 0), 79) / 100;
    var price = cost / (1 - margin) + trees * r.r_tree;
    if (price < r.r_min) price = r.r_min;

    return {
      ready:true,
      depth:depth, len:len, area:area, volume:volume, haulVol:haulVol, hauled:hauled,
      loads:loads, days:days, trees:trees,
      cutHours:cutHours, treeHours:treeHours, haulHours:haulHours,
      manHours:manHours, crewHours:crewHours, crew:crew,
      crewPay:crewPay, usingOverride:crewPay !== suggestedPay, effRate:effRate,
      mgmtHours:mgmtHours, mgmtCost:mgmtCost, equip:equip, dumpFee:dumpFee,
      mob:r.r_mob, treeFee:trees * r.r_tree, cost:cost, price:price,
      site:site, bestAlt:bestAlt, floor:r.r_crewfloor,
      perFt: len > 0 ? price / len : 0
    };
  }

  function renderOpts(results){
    var host = $("opts");
    host.innerHTML = "";
    results.forEach(function(c, i){
      var b = document.createElement("button");
      b.type = "button";
      b.className = "opt";
      b.setAttribute("aria-pressed", i === selected ? "true" : "false");

      var band = document.createElement("span");
      band.className = "band";
      band.textContent = c.depth + " ft back";

      var amt = document.createElement("span");
      amt.className = "amt";
      amt.textContent = c.ready ? money(c.price) : "—";

      var meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = c.ready
        ? c.days.toFixed(1) + " days · " +
          (c.loads > 0 ? c.loads + " loads" : "stacked on site") +
          " · $" + c.perFt.toFixed(0) + "/ft"
        : "";

      b.appendChild(band); b.appendChild(amt); b.appendChild(meta);
      b.addEventListener("click", function(){ selected = i; render(); });
      host.appendChild(b);
    });
  }

  function renderBreakdown(c){
    if (!c.ready) {
      $("bdTitle").textContent = "Fill in the job";
      $("bdSize").textContent = "";
      var h = $("rows"); h.innerHTML = "";
      var row = document.createElement("div"); row.className = "row";
      var a = document.createElement("span");
      a.textContent = "Still needed: " + c.missing.join(", ");
      row.appendChild(a); h.appendChild(row);
      $("warn").hidden = true;
      return;
    }
    $("bdTitle").textContent = c.depth + " ft back";
    $("bdSize").textContent = c.area > 0
      ? Math.round(c.area).toLocaleString("en-US") + " ft²  ·  " + c.volume.toFixed(0) + " yd³ cut"
        + (c.hauled < 1 ? "  ·  " + c.haulVol.toFixed(0) + " yd³ hauled" : "")
      : "";

    var rows = [
      ["Crew hours", c.manHours.toFixed(1) + " man-hr over " + c.days.toFixed(1) + " days"],
      ["Crew pay", money(c.crewPay) + (c.usingOverride ? "" : " suggested")],
      ["Works out at", "$" + c.effRate.toFixed(2) + "/man-hr"],
      ["Your management", c.mgmtHours.toFixed(1) + " hr · " + money(c.mgmtCost)],
      ["Truck, saws", money(c.equip)],
      ["Dump — " + c.site.name, c.loads > 0 ? money(c.dumpFee) : "nothing hauled"],
      ["Mobilization", money(c.mob)],
      ["Direct cost", money(c.cost)],
      ["Quote", money(c.price)]
    ];

    var host = $("rows");
    host.innerHTML = "";
    rows.forEach(function(pair, i){
      var row = document.createElement("div");
      row.className = "row" + (i >= rows.length - 2 ? " em" : "");
      var a = document.createElement("span"); a.textContent = pair[0];
      var b = document.createElement("span"); b.textContent = pair[1];
      row.appendChild(a); row.appendChild(b);
      host.appendChild(row);
    });

    var warns = [];
    if (c.effRate > 0 && c.effRate < 7.25) {
      warns.push("Crew clears $" + c.effRate.toFixed(2) + "/hr — under federal minimum wage.");
    } else if (c.effRate > 0 && c.effRate < c.floor) {
      warns.push("Crew clears $" + c.effRate.toFixed(2) + "/man-hr, under your $" + c.floor + " floor.");
    }
    if (c.loads > 0 && c.site.cap > 0 && c.haulVol > c.site.cap) {
      warns.push(c.site.name + " caps at " + c.site.cap + " yd³/day. This hauls " +
        c.haulVol.toFixed(0) + " yd³.");
    }
    if (c.loads > 0 && c.bestAlt && c.dumpFee - c.bestAlt.cost > 100) {
      warns.push(c.bestAlt.site.name + " would cost " + money(c.bestAlt.cost) +
        " — saves " + money(c.dumpFee - c.bestAlt.cost) + ".");
    }
    if (c.loads > 0 && c.site.closed && c.days > 1) {
      warns.push(c.site.name + " closed " + c.site.closed + ".");
    }

    var w = $("warn");
    w.innerHTML = "";
    if (warns.length) {
      warns.forEach(function(t){
        var p = document.createElement("p"); p.textContent = t; w.appendChild(p);
      });
      w.hidden = false;
    } else {
      w.hidden = true;
    }
  }

  function render(){
    var off = $("haulAny").value !== "1";
    $("haulPctField").classList.toggle("off", off);
    $("haulPct").disabled = off;

    var results = CFG.depths.map(compute);
    var mid = results[selected];
    renderFinal(mid);
    $("haulPctOut").textContent = off
      ? "none of it — nothing leaves"
      : (mid.ready
          ? $("haulPct").value + "% of the job · " + mid.haulVol.toFixed(0) + " yd³ hauled"
          : $("haulPct").value + "% of the job");

    renderOpts(results);
    renderBreakdown(results[selected]);

    var an = $("allNote");
    if ($("allDepths").checked) {
      var ok = results.filter(function(r){ return r.ready; });
      an.textContent = ok.length === results.length
        ? "The quote will show " + results.map(function(r){ return r.depth + " ft"; }).join(", ") +
          " with the measured working behind each, and mark " +
          results[selected].depth + " ft as the one you recommend."
        : "";
      an.hidden = !an.textContent;
    } else {
      an.hidden = true;
    }
  }

  // Whatever goes on the customer's document: the calculated price unless
  // he has typed over it.
  function finalPrice(c){
    var v = parseFloat($("finalPrice").value);
    return (isFinite(v) && v > 0) ? v : c.price;
  }

  function renderFinal(c){
    var el = $("finalNote");
    if (!c.ready) { el.className = "finalnote"; el.textContent = ""; return; }
    var v = parseFloat($("finalPrice").value);
    var overridden = isFinite(v) && v > 0;
    var p = overridden ? v : c.price;
    var marginPct = p > 0 ? (p - c.cost) / p * 100 : 0;
    el.className = "finalnote" + (p < c.cost ? " warn-low" : "");

    if (!overridden) {
      el.innerHTML = "";
      el.append("The PDF will show ");
      var b = document.createElement("b"); b.textContent = money(c.price); el.append(b);
      el.append(" — " + marginPct.toFixed(0) + "% margin.");
      return;
    }
    var diff = p - c.price;
    el.innerHTML = "";
    var b2 = document.createElement("b"); b2.textContent = money(p); el.append(b2);
    el.append(" on the PDF — " + money(Math.abs(diff)) +
      (diff < 0 ? " under" : " over") + " the calculated price. ");
    if (p < c.cost) {
      el.append("That is below your direct cost of " + money(c.cost) + ". You would lose money.");
    } else {
      el.append(marginPct.toFixed(0) + "% margin, " + money(p - c.cost) + " profit.");
    }
  }

  // ---- PDF quote ----

  // The three lines, shared by both documents. Gate fees pass through at
  // cost; everything else carries the margin, scaled so the lines add up
  // to exactly the calculated price.
  function priceLines(c, B, dw){
    var rows = [];
    var passThru = B.atCost ? Math.min(c.dumpFee, Math.max(0, c.price - 1)) : 0;
    var marked = c.cost + c.treeFee - passThru;
    var k = marked > 0 ? (c.price - passThru) / marked : 0;

    var labDesc = Math.round(c.len) + " ft × " + c.depth + " ft of " +
                  ((dw && dw.words) || "brush") + "  ·  " +
                  c.manHours.toFixed(1) + " crew hours";
    if (c.trees > 0) {
      labDesc += "  ·  " + c.trees + (c.trees === 1 ? " tree" : " trees") + " taken down";
    }
    rows.push({t: String(B.rowLabor || "Labor"), d: labDesc,
               v: (c.crewPay + c.mgmtCost + c.treeFee) * k});
    rows.push({t: String(B.rowMaterials || "Materials"),
               d: "Saws, fuel, blades, truck and trailer",
               v: (c.equip + c.mob) * k});
    if (c.loads > 0) {
      rows.push({
        t: String(B.rowDump || "Dump and haul-off"),
        d: (c.site.full || c.site.name) + "  ·  " + c.haulVol.toFixed(0) +
           " yd³ in " + c.loads + (c.loads === 1 ? " load" : " loads") +
           " at $" + c.site.perYd.toFixed(2) + " per yd³",
        v: B.atCost ? passThru : c.dumpFee * k,
        atCost: !!B.atCost
      });
    }
    return rows;
  }

  // What was measured or counted to get there. Physical facts only — no
  // crew pay, no margin.
  function measuredRows(c, dw){
    var n = function(x){ return Math.round(x).toLocaleString("en-US"); };
    var out = [];
    out.push(["Ground cleared",
      n(c.area) + " ft²  (" + n(c.len) + " ft of fence × " + c.depth + " ft back)"]);
    out.push(["Cut material it makes", c.volume.toFixed(0) + " yd³"]);
    if (c.trees > 0) {
      out.push(["Trees over 6 inches", c.trees + " to drop and buck"]);
    }
    if (c.loads > 0) {
      out.push(["Taken off the property",
        c.haulVol.toFixed(0) + " yd³" +
        (c.hauled < 0.95 ? "  (" + Math.round(c.hauled * 100) + "% of the job)" : "") +
        "  —  " + c.loads + (c.loads === 1 ? " trailer load" : " trailer loads") +
        " at " + CFG.trailerYd + " yd³ a load"]);
      out.push(["Where it goes", (c.site.full || c.site.name) +
        "  ·  $" + c.site.perYd.toFixed(2) + " per yd³ at the gate"]);
      var trip = Math.max(0, parseFloat($("roundtrip").value) || 0);
      if (trip > 0) {
        out.push(["Driving", c.loads + (c.loads === 1 ? " round trip" : " round trips") +
          " of " + trip + " minutes  —  " +
          (c.loads * trip / 60).toFixed(1) + " hours on the road"]);
      }
    } else {
      out.push(["Taken off the property", "nothing — it stays where you want it"]);
    }
    out.push(["Crew on site", c.manHours.toFixed(1) + " work hours  —  " +
      c.crew + (c.crew === 1 ? " person" : " people") + " for " +
      c.days.toFixed(1) + (c.days === 1 ? " day" : " days")]);
    return out;
  }

  function pdfHead(doc, B, AC, L, W){
    var y = 64;
    doc.setFont("helvetica","bold"); doc.setFontSize(22); doc.setTextColor(30);
    doc.text(String(B.company || ""), L, y);
    doc.setFont("helvetica","normal"); doc.setFontSize(10.5); doc.setTextColor(120);
    var sub = [B.tagline, B.phone, B.web].filter(function(x){ return x; }).join("   ·   ");
    y += 16; doc.text(sub, L, y);
    doc.setDrawColor(AC[0],AC[1],AC[2]); doc.setLineWidth(2);
    y += 12; doc.line(L, y, W - L, y);
    return y;
  }

  // ---- the long-form quote: every depth, and the working behind each ----
  function buildPdfAll(results, pickIdx){
    var JS = window.jspdf && window.jspdf.jsPDF;
    if (!JS) return null;
    var doc = new JS({unit:"pt", format:"letter"});
    var L = 56, W = 612, BOT = 754;
    var B = CFG.brand, AC = hexRgb(B.accent);
    var dw = densByKey($("dens").value);
    var name = ($("custName").value || "").trim();
    var addr = ($("custAddr").value || "").trim();
    var today = new Date();
    var until = new Date(today.getTime() + (parseFloat(B.validDays) || 30)*864e5);
    var fmt = function(d){ return d.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}); };
    var y = pdfHead(doc, B, AC, L, W);

    function need(h){
      if (y + h > BOT) { doc.addPage(); y = 64; return true; }
      return false;
    }

    doc.setTextColor(30); doc.setFont("helvetica","bold"); doc.setFontSize(13);
    y += 28; doc.text("QUOTE", L, y);
    doc.setFont("helvetica","normal"); doc.setFontSize(10.5); doc.setTextColor(110);
    doc.text(fmt(today), W - L, y, {align:"right"});
    doc.setTextColor(30); doc.setFontSize(11);
    if (name) { y += 22; doc.text("Prepared for: " + name, L, y); }
    if (addr) { y += 15; doc.text(addr, L, y); }

    doc.setFont("helvetica","bold"); doc.setFontSize(11);
    y += 30; doc.text("THE WORK", L, y);
    doc.setFont("helvetica","normal"); doc.setFontSize(11);
    var lead = "Clearing the " + Math.round(results[0].len) + " ft run behind your fence — " +
      ((dw && dw.words) || "brush") + ", cut to ground level and left walkable. " +
      "How far back is up to you; here is what each depth costs and why.";
    y += 16; doc.text(doc.splitTextToSize(lead, W - 2*L), L, y);
    y += 30;

    // the options, side by side
    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(30);
    y += 8; doc.text("YOUR OPTIONS", L, y);
    y += 8;
    doc.setDrawColor(210); doc.setLineWidth(0.7); doc.line(L, y, W - L, y);
    results.forEach(function(c, i){
      y += 20;
      var isPick = i === pickIdx;
      doc.setFont("helvetica","bold"); doc.setFontSize(11.5);
      doc.setTextColor(isPick ? AC[0] : 30, isPick ? AC[1] : 30, isPick ? AC[2] : 30);
      doc.text(c.depth + " ft back", L, y);
      doc.setFontSize(12.5);
      doc.text(money(c.shown), W - L, y, {align:"right"});
      y += 12;
      doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(125);
      var line = Math.round(c.area).toLocaleString("en-US") + " ft²  ·  " +
                 c.volume.toFixed(0) + " yd³ cut  ·  " +
                 (c.loads > 0 ? c.loads + (c.loads === 1 ? " load" : " loads") + " hauled"
                              : "nothing hauled") + "  ·  " +
                 c.days.toFixed(1) + (c.days === 1 ? " day" : " days") + " on site";
      if (isPick) line += "   —   what we would do";
      doc.text(line, L, y);
      doc.setDrawColor(228); doc.setLineWidth(0.5); doc.line(L, y + 7, W - L, y + 7);
    });

    // included / not included, shared by all three
    y += 30;
    var any = results[pickIdx];
    var dbr = any.hauled <= 0
      ? { inc: B.haulNone || [], exc: B.haulNoneExc || [] }
      : (any.hauled >= 0.95 ? { inc: B.haulAll || [], exc: [] }
                            : { inc: B.haulPart || [], exc: [] });
    var inc = (B.inc || []).concat(dbr.inc);
    if (B.showGuarantee && B.guarantee) inc = inc.concat([B.guarantee]);
    need(40 + inc.length * 15);
    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(30);
    doc.text("INCLUDED AT ANY DEPTH", L, y);
    doc.setFont("helvetica","normal"); doc.setFontSize(10.5);
    inc.forEach(function(t){ y += 15; doc.text("•  " + t, L + 4, y); });

    y += 26;
    var exc = (B.exc || []).concat(dbr.exc);
    need(30 + exc.length * 15);
    doc.setFont("helvetica","bold"); doc.setFontSize(10);
    doc.text("NOT INCLUDED", L, y);
    doc.setFont("helvetica","normal"); doc.setFontSize(10.5);
    exc.forEach(function(t){ y += 15;
      doc.text(doc.splitTextToSize("•  " + t, W - 2*L - 8)[0], L + 4, y); });

    // ---- the working ----
    doc.addPage(); y = 64;
    doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(30);
    doc.text("HOW EACH PRICE IS WORKED OUT", L, y);
    doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(120);
    y += 15;
    doc.text("Every figure is measured or counted, and dump fees pass straight through at cost.", L, y);
    y += 14;

    results.forEach(function(c, i){
      var meas = measuredRows(c, dw);
      var lines = priceLines(c, B, dw);
      need(66 + meas.length * 12.5 + lines.length * 14 + (c.reduced ? 28 : 0));

      y += 14;
      doc.setFillColor(237,239,233);
      doc.rect(L, y - 13, W - 2*L, 22, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(30);
      doc.text(c.depth + " FT BACK" + (i === pickIdx ? "   —   RECOMMENDED" : ""), L + 8, y);
      doc.text(money(c.shown), W - L - 8, y, {align:"right"});
      y += 18;

      meas.forEach(function(r){
        y += 12.5;
        doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(120);
        doc.text(r[0], L + 8, y);
        doc.setTextColor(40);
        doc.text(doc.splitTextToSize(String(r[1]), W - L - 8 - (L + 186))[0], L + 186, y);
      });

      y += 10;
      doc.setDrawColor(215); doc.setLineWidth(0.6); doc.line(L + 8, y, W - L - 8, y);
      lines.forEach(function(r){
        y += 14;
        doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(60);
        doc.text(r.t + (r.atCost ? "  (at cost)" : ""), L + 8, y);
        doc.setFont("helvetica","normal");
        doc.text(money(r.v), W - L - 8, y, {align:"right"});
      });
      y += 6;
      doc.setDrawColor(215); doc.line(L + 8, y, W - L - 8, y);
      y += 14;
      doc.setFont("helvetica","bold"); doc.setFontSize(10.5); doc.setTextColor(30);
      doc.text(c.reduced ? "Standard total" : "Price for this option", L + 8, y);
      doc.text(money(c.price), W - L - 8, y, {align:"right"});
      if (c.reduced) {
        var why = ($("discLabel").value || "").trim() || String(B.redLabel || "Reduction");
        y += 14;
        doc.setFont("helvetica","normal"); doc.setTextColor(AC[0],AC[1],AC[2]);
        doc.text(why, L + 8, y);
        doc.text("-" + money(c.price - c.shown), W - L - 8, y, {align:"right"});
        y += 14;
        doc.setFont("helvetica","bold"); doc.setTextColor(30);
        doc.text("Your price", L + 8, y);
        doc.text(money(c.shown), W - L - 8, y, {align:"right"});
      }
      y += 4;
    });

    y += 14;
    if (y + 30 > 770) { doc.addPage(); y = 64; }
    doc.setTextColor(120); doc.setFont("helvetica","normal"); doc.setFontSize(9);
    var tail = "Fixed prices, not hourly estimates. They hold until " + fmt(until) + ". " +
               String(B.terms || "");
    doc.splitTextToSize(tail.trim(), W - 2*L).forEach(function(ln, n){
      doc.text(ln, L, y + n*12);
    });
    return doc;
  }

  function buildPdf(c){
    var JS = window.jspdf && window.jspdf.jsPDF;
    if (!JS) return null;
    var doc = new JS({unit:"pt", format:"letter"});
    var L = 56, W = 612, y = 64;
    var name = ($("custName").value || "").trim();
    var addr = ($("custAddr").value || "").trim();
    var today = new Date();
    var until = new Date(today.getTime() + (parseFloat(CFG.brand.validDays) || 30)*864e5);
    var fmt = function(d){ return d.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}); };

    doc.setFont("helvetica","bold"); doc.setFontSize(22);
    var B = CFG.brand, AC = hexRgb(B.accent);
    doc.text(String(B.company || ""), L, y);
    doc.setFont("helvetica","normal"); doc.setFontSize(10.5); doc.setTextColor(120);
    var sub = [B.tagline, B.phone, B.web].filter(function(x){ return x; }).join("   \u00b7   ");
    y += 16; doc.text(sub, L, y);
    doc.setDrawColor(AC[0],AC[1],AC[2]); doc.setLineWidth(2);
    y += 12; doc.line(L, y, W - L, y);

    doc.setTextColor(30); doc.setFont("helvetica","bold"); doc.setFontSize(13);
    y += 28; doc.text("QUOTE", L, y);
    doc.setFont("helvetica","normal"); doc.setFontSize(10.5); doc.setTextColor(110);
    doc.text(fmt(today), W - L, y, {align:"right"});

    doc.setTextColor(30); doc.setFontSize(11);
    if (name) { y += 22; doc.text("Prepared for: " + name, L, y); }
    if (addr) { y += 15; doc.text(addr, L, y); }

    doc.setFont("helvetica","bold"); doc.setFontSize(11);
    y += 30; doc.text("THE WORK", L, y);
    doc.setFont("helvetica","normal"); doc.setFontSize(11);
    var dw = densByKey($("dens").value);
    var scope = String(B.scope || "")
      .replace(/\{len\}/g, Math.round(c.len))
      .replace(/\{depth\}/g, c.depth)
      .replace(/\{density\}/g, (dw && dw.words) || "brush");
    var dbr = c.hauled <= 0
      ? { inc: B.haulNone || [], exc: B.haulNoneExc || [] }
      : (c.hauled >= 0.95 ? { inc: B.haulAll || [], exc: [] }
                          : { inc: B.haulPart || [], exc: [] });
    y += 16; doc.text(doc.splitTextToSize(scope, W - 2*L), L, y);
    y += 30;

    var inc = (B.inc || []).concat(dbr.inc);
    if (B.showGuarantee && B.guarantee) inc = inc.concat([B.guarantee]);
    doc.setFont("helvetica","bold"); doc.setFontSize(10);
    doc.text("INCLUDED", L, y);
    doc.setFont("helvetica","normal"); doc.setFontSize(10.5);
    inc.forEach(function(t){ y += 15; doc.text("•  " + t, L + 4, y); });

    y += 26;
    doc.setFont("helvetica","bold"); doc.setFontSize(10);
    doc.text("NOT INCLUDED", L, y);
    doc.setFont("helvetica","normal"); doc.setFontSize(10.5);
    (B.exc || []).concat(dbr.exc)
      .forEach(function(t){ y += 15; doc.text(doc.splitTextToSize("•  " + t, W - 2*L - 8)[0], L + 4, y); });

    var shown = finalPrice(c);

    // ---- where the price comes from -------------------------------------
    // Gate fees pass through at cost. Everything else carries the margin,
    // scaled so the lines add up to exactly the price on the page.
    var rows = priceLines(c, B, dw);

    var reduced = shown < c.price - 0.5;
    var showCov = B.showCovers !== false;
    var needH = showCov ? 30 + rows.length * 26 + 18 + (reduced ? 34 : 0) : 0;
    if (y + needH + (reduced ? 70 : 52) + 60 > 740) { doc.addPage(); y = 64; }
    else { y += 32; }
    if (showCov) {

    doc.setTextColor(30); doc.setFont("helvetica","bold"); doc.setFontSize(10);
    doc.text(String(B.covTitle || "What this price covers"), L, y);
    y += 8;
    doc.setDrawColor(210); doc.setLineWidth(0.7);
    doc.line(L, y, W - L, y);

    rows.forEach(function(r){
      y += 19;
      doc.setFont("helvetica","bold"); doc.setFontSize(10.5); doc.setTextColor(30);
      doc.text(r.t, L, y);
      doc.setFont("helvetica","normal"); doc.setFontSize(11);
      doc.text(money(r.v), W - L, y, {align:"right"});
      y += 12;
      doc.setFontSize(9); doc.setTextColor(125);
      doc.text(r.d + (r.atCost ? "  ·  billed at cost, no markup" : ""), L, y);
      doc.setDrawColor(228); doc.setLineWidth(0.5);
      doc.line(L, y + 6, W - L, y + 6);
    });

    y += 22;
    doc.setFont("helvetica","bold"); doc.setFontSize(10.5); doc.setTextColor(30);
    doc.text(reduced ? "Standard total" : "Total", L, y);
    doc.text(money(c.price), W - L, y, {align:"right"});

    if (reduced) {
      var why = ($("discLabel").value || "").trim() || String(B.redLabel || "Reduction");
      y += 17;
      doc.setFont("helvetica","normal"); doc.setFontSize(10.5); doc.setTextColor(AC[0],AC[1],AC[2]);
      doc.text(why, L, y);
      doc.text("-" + money(c.price - shown), W - L, y, {align:"right"});
      y += 8;
      doc.setDrawColor(210); doc.setLineWidth(0.7); doc.line(L, y, W - L, y);
      y += 15;
      doc.setFont("helvetica","bold"); doc.setFontSize(10.5); doc.setTextColor(30);
      doc.text("Your price", L, y);
      doc.text(money(shown), W - L, y, {align:"right"});
    }
    }

    y += 32;
    var cut = reduced;          // he has come down from the standard price
    var boxH = cut ? 70 : 52;
    doc.setFillColor(237,239,233); doc.rect(L, y, W - 2*L, boxH, "F");

    if (cut) {
      // the struck-through figure is this job's own calculated price, nothing invented
      doc.setFont("helvetica","normal"); doc.setFontSize(10.5); doc.setTextColor(120);
      var wasLabel = "Standard price  " + money(c.price);
      doc.text(wasLabel, W - L - 14, y + 22, {align:"right"});
      var wLine = doc.getTextWidth(money(c.price));
      var xEnd = W - L - 14, xStart = xEnd - wLine;
      doc.setDrawColor(150); doc.setLineWidth(0.9);
      doc.line(xStart, y + 18.5, xEnd, y + 18.5);

      var reason = ($("discLabel").value || "").trim();
      if (reason) {
        doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(40);
        doc.text(reason.toUpperCase(), L + 14, y + 22);
      }

      doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(40);
      doc.text("YOUR PRICE", L + 14, y + 44);
      doc.setFontSize(26); doc.setTextColor(AC[0],AC[1],AC[2]);
      doc.text(money(shown), W - L - 14, y + 50, {align:"right"});
      doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(110);
      doc.text("Fixed price. Not an hourly estimate. You save " + money(c.price - shown) + ".",
               L + 14, y + 60);
    } else {
      doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(40);
      doc.text("YOUR PRICE", L + 14, y + 21);
      doc.setFontSize(26); doc.setTextColor(AC[0],AC[1],AC[2]);
      doc.text(money(shown), W - L - 14, y + 30, {align:"right"});
      doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(110);
      doc.text("Fixed price. Not an hourly estimate.", L + 14, y + 40);
    }
    y += boxH + 28;
    if (y > 756) { doc.addPage(); y = 64; }

    doc.setTextColor(120); doc.setFontSize(9);
    var tail = "This price holds until " + fmt(until) + ". " + String(B.terms || "");
    doc.splitTextToSize(tail.trim(), W - 2*L).forEach(function(ln, n){
      doc.text(ln, L, y + n*12);
    });

    return doc;
  }


  $("mkpdf").addEventListener("click", function(){
    var st = $("pdfStatus");
    var results = CFG.depths.map(compute);
    var c = results[selected];
    if (!c.ready) { st.textContent = "Fill in " + c.missing.join(", ") + " first."; return; }

    var all = $("allDepths").checked;
    var doc;
    if (all) {
      // the typed-over price applies to the depth he picked; the others
      // stand at what they calculate to
      results.forEach(function(r, i){
        r.shown = (i === selected) ? finalPrice(r) : r.price;
        r.reduced = r.shown < r.price - 0.5;
      });
      doc = buildPdfAll(results, selected);
    } else {
      doc = buildPdf(c);
    }
    if (!doc) { st.textContent = "PDF library did not load — check the connection."; return; }
    var nm = ($("custName").value || "quote").trim().replace(/[^A-Za-z0-9 _-]/g, "").slice(0, 40) || "quote";
    var filename = "Swanston quote - " + nm +
      (all ? " - all depths" : " - " + c.depth + "ft") + ".pdf";
    var blob = doc.output("blob");
    st.textContent = "Preparing…";

    function fallback(){
      try {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
        st.textContent = "Saved.";
      } catch (e) { st.textContent = "Could not save the file here."; }
    }

    if (window.claude && typeof window.claude.use === "function") {
      window.claude.use("downloads").then(function(dl){
        if (!dl) { fallback(); return; }
        return dl.save({filename:filename, data:blob}).then(function(){
          st.textContent = "Saved.";
        }).catch(function(err){
          st.textContent = (err && err.code === "declined") ? "Cancelled." : "Could not save — try again.";
        });
      }).catch(fallback);
    } else {
      fallback();
    }
  });


  // ---- settings: read, write, persist ----
  var dbRef = null, LS_KEY = "swanston_cfg_v3", OLD_RATES_KEY = "swanston_rates_v2";

  function num(id, dflt){
    var v = parseFloat($(id).value);
    return isFinite(v) ? v : dflt;
  }
  function slug(t){
    return String(t || "x").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) ||
           ("k" + Math.random().toString(36).slice(2, 7));
  }

  function fieldRow(host, spec, onDel){
    var row = document.createElement("div");
    row.className = "lrow";
    spec.forEach(function(f){
      var w = document.createElement("div");
      w.className = "f" + (f.wide ? " wide" : "");
      var lb = document.createElement("label");
      lb.textContent = f.label;
      var inp = document.createElement("input");
      inp.type = f.type || "text";
      if (f.step) inp.step = f.step;
      if (f.type === "number") { inp.min = "0"; inp.inputMode = "decimal"; }
      inp.value = f.value == null ? "" : f.value;
      inp.autocomplete = "off";
      inp.addEventListener("input", function(){ f.set(inp.value); syncFromCfgLight(); });
      w.appendChild(lb); w.appendChild(inp);
      row.appendChild(w);
    });
    if (onDel) {
      var d = document.createElement("button");
      d.type = "button"; d.className = "del"; d.textContent = "Remove";
      d.addEventListener("click", onDel);
      row.appendChild(d);
    }
    host.appendChild(row);
  }

  function renderDensRows(){
    var host = $("densRows"); host.innerHTML = "";
    CFG.density.forEach(function(d, idx){
      fieldRow(host, [
        {label:"Name in the dropdown", value:d.label, wide:true, set:function(v){ d.label = v; }},
        {label:"Words on the PDF", value:d.words, wide:true, set:function(v){ d.words = v; }},
        {label:"Cut rate ft²/hr", type:"number", step:"5", value:d.cut, set:function(v){ d.cut = parseFloat(v) || 1; }},
        {label:"Yd³ per 100 ft²", type:"number", step:"0.5", value:d.vol, set:function(v){ d.vol = parseFloat(v) || 0; }}
      ], CFG.density.length > 1 ? function(){
        CFG.density.splice(idx, 1); renderDensRows(); syncSelects(); render();
      } : null);
    });
  }

  function renderSiteRows(){
    var host = $("siteRows"); host.innerHTML = "";
    CFG.sites.forEach(function(st, idx){
      fieldRow(host, [
        {label:"Short name", value:st.name, set:function(v){ st.name = v; }},
        {label:"Full name on the PDF", value:st.full, wide:true, set:function(v){ st.full = v; }},
        {label:"$ per yd³", type:"number", step:"0.25", value:st.perYd, set:function(v){ st.perYd = parseFloat(v) || 0; }},
        {label:"Minimum charge $", type:"number", step:"1", value:st.min, set:function(v){ st.min = parseFloat(v) || 0; }},
        {label:"Daily cap yd³", type:"number", step:"1", value:st.cap, set:function(v){ st.cap = parseFloat(v) || 0; }},
        {label:"Closed days", value:st.closed, set:function(v){ st.closed = v; }}
      ], CFG.sites.length > 1 ? function(){
        CFG.sites.splice(idx, 1); renderSiteRows(); syncSelects(); render();
      } : null);
    });
  }

  // rebuild the two dropdowns that are driven by the lists above
  function syncSelects(){
    [["dens", CFG.density, function(d){ return d.label; }],
     ["site", CFG.sites, function(st){
        return st.name + " — $" + (Math.round(st.perYd * 100) / 100) + "/yd³";
     }]].forEach(function(t){
      var sel = $(t[0]), keep = sel.value;
      sel.innerHTML = "";
      var blank = document.createElement("option");
      blank.value = ""; blank.textContent = "—";
      sel.appendChild(blank);
      t[1].forEach(function(item){
        var o = document.createElement("option");
        o.value = item.key; o.textContent = t[2](item);
        sel.appendChild(o);
      });
      sel.value = keep;
      if (sel.value !== keep) sel.value = "";
    });
    $("access").options[1].value = "1";
    $("access").options[2].value = String(CFG.extreme);
    $("terrain").options[2].value = String(CFG.terrain2);
    $("terrain").options[3].value = String(CFG.terrain3);
  }

  // CFG -> the Customize form
  function cfgToForm(){
    RATE_IDS.forEach(function(k){
      if ($(k) && typeof CFG.rates[k] === "number") $(k).value = CFG.rates[k];
    });
    $("c_d1").value = CFG.depths[0]; $("c_d2").value = CFG.depths[1]; $("c_d3").value = CFG.depths[2];
    $("c_trailer").value = CFG.trailerYd;
    $("c_treehr").value = CFG.treeHours;
    $("c_loadhr").value = CFG.loadHours;
    $("c_stackhr").value = CFG.stackHours;
    $("c_extreme").value = CFG.extreme;
    $("c_t2").value = CFG.terrain2;
    $("c_t3").value = CFG.terrain3;
    var B = CFG.brand;
    $("b_company").value = B.company; $("b_tagline").value = B.tagline;
    $("b_phone").value = B.phone; $("b_web").value = B.web;
    $("b_accent").value = B.accent; $("b_valid").value = B.validDays;
    $("b_scope").value = B.scope;
    $("b_inc").value = (B.inc || []).join("\n");
    $("b_exc").value = (B.exc || []).join("\n");
    $("b_hall").value = (B.haulAll || []).join("\n");
    $("b_hpart").value = (B.haulPart || []).join("\n");
    $("b_hnone").value = (B.haulNone || []).join("\n");
    $("b_hnoneexc").value = (B.haulNoneExc || []).join("\n");
    $("b_terms").value = B.terms;
    $("b_guarantee").value = B.guarantee;
    $("b_covtitle").value = B.covTitle;
    $("b_rowlab").value = B.rowLabor;
    $("b_rowmat").value = B.rowMaterials;
    $("b_rowdump").value = B.rowDump;
    $("b_redlabel").value = B.redLabel;
    $("b_showcov").checked = B.showCovers !== false;
    $("b_atcost").checked = B.atCost !== false;
    $("b_showguar").checked = B.showGuarantee !== false;
    renderDensRows(); renderSiteRows(); syncSelects();
  }

  // the Customize form -> CFG (lists are edited in place by fieldRow)
  function formToCfg(){
    RATE_IDS.forEach(function(k){
      var v = parseFloat($(k).value);
      CFG.rates[k] = isFinite(v) ? v : DEFAULTS[k];
    });
    CFG.depths = [num("c_d1", 6), num("c_d2", 10), num("c_d3", 15)];
    CFG.trailerYd = Math.max(0.5, num("c_trailer", 11));
    CFG.treeHours = num("c_treehr", 0.75);
    CFG.loadHours = num("c_loadhr", 0.6);
    CFG.stackHours = num("c_stackhr", 1.2);
    CFG.extreme = Math.max(1, num("c_extreme", 1.35));
    CFG.terrain2 = Math.max(1, num("c_t2", 1.15));
    CFG.terrain3 = Math.max(1, num("c_t3", 1.35));
    var B = CFG.brand;
    B.company = $("b_company").value; B.tagline = $("b_tagline").value;
    B.phone = $("b_phone").value; B.web = $("b_web").value;
    B.accent = $("b_accent").value; B.validDays = num("b_valid", 30);
    B.scope = $("b_scope").value;
    B.inc = lines($("b_inc").value); B.exc = lines($("b_exc").value);
    B.haulAll = lines($("b_hall").value); B.haulPart = lines($("b_hpart").value);
    B.haulNone = lines($("b_hnone").value); B.haulNoneExc = lines($("b_hnoneexc").value);
    B.terms = $("b_terms").value;
    B.guarantee = $("b_guarantee").value;
    B.covTitle = $("b_covtitle").value; B.redLabel = $("b_redlabel").value;
    B.rowLabor = $("b_rowlab").value;
    B.rowMaterials = $("b_rowmat").value;
    B.rowDump = $("b_rowdump").value;
    B.showCovers = $("b_showcov").checked;
    B.atCost = $("b_atcost").checked;
    B.showGuarantee = $("b_showguar").checked;
  }

  // readRates() reads live inputs, so keep CFG.rates in step as he types
  function syncFromCfgLight(){ syncSelects(); render(); }

  function mergeCfg(saved){
    if (!saved || typeof saved !== "object") return;
    var base = cfgDefaults();
    Object.keys(base).forEach(function(k){
      if (k === "brand") {
        CFG.brand = Object.assign({}, base.brand, saved.brand || {});
      } else if (k === "rates") {
        CFG.rates = Object.assign({}, base.rates, saved.rates || {});
      } else if (Array.isArray(base[k])) {
        CFG[k] = Array.isArray(saved[k]) && saved[k].length ? saved[k] : base[k];
      } else {
        CFG[k] = (typeof saved[k] === typeof base[k]) ? saved[k] : base[k];
      }
    });
    CFG.density.forEach(function(d, n){ if (!d.key) d.key = slug(d.label) + n; });
    CFG.sites.forEach(function(st, n){ if (!st.key) st.key = slug(st.name) + n; });
  }

  function localLoad(){
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
      var old = localStorage.getItem(OLD_RATES_KEY);   // pre-Customize saves
      if (old) return {rates: JSON.parse(old)};
    } catch (e) {}
    return null;
  }
  function localSave(o){ try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) {} }

  $("addDens").addEventListener("click", function(){
    CFG.density.push({key:"d" + Date.now().toString(36), label:"New density",
                      words:"brush", cut:120, vol:3});
    renderDensRows(); syncSelects(); render();
  });
  $("addSite").addEventListener("click", function(){
    CFG.sites.push({key:"s" + Date.now().toString(36), name:"New site", full:"",
                    perYd:10, min:0, cap:0, closed:""});
    renderSiteRows(); syncSelects(); render();
  });

  document.querySelectorAll(".ctab").forEach(function(tab){
    tab.addEventListener("click", function(){
      document.querySelectorAll(".ctab").forEach(function(t){
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      document.querySelectorAll(".cpane").forEach(function(pane){
        pane.hidden = pane.getAttribute("data-p") !== tab.getAttribute("data-t");
      });
    });
  });

  $("save").addEventListener("click", function(){
    formToCfg();
    localSave(CFG);
    render();
    if (dbRef) {
      $("status").textContent = "Saving…";
      dbRef.doc("settings/config").set(CFG).then(function(){
        $("status").textContent = "Saved to your account.";
      }).catch(function(){ $("status").textContent = "Saved on this device."; });
    } else {
      $("status").textContent = "Saved on this device.";
    }
  });

  $("reset").addEventListener("click", function(){
    CFG = cfgDefaults();
    cfgToForm();
    $("status").textContent = "Defaults restored — save to keep.";
    render();
  });

  document.querySelectorAll("input, select, textarea").forEach(function(el){
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  mergeCfg(localLoad());
  cfgToForm();
  render();

  // the panel is always on screen; it turns itself off if it cannot reach Claude
  aiUnavailable("Checking\u2026");

  // ---- read the job from photos and a description ----
  var NO_AI = "Reading the job only works in the Claude version of this page \u2014 " +
              "fill the form in yourself here.";
  var pics = [];

  function drawThumbs(){
    var host = $("thumbs"); host.innerHTML = "";
    pics.forEach(function(f, idx){
      var wrap = document.createElement("div"); wrap.className = "thumb";
      var img = document.createElement("img");
      img.alt = ""; img.src = URL.createObjectURL(f);
      img.addEventListener("load", function(){ URL.revokeObjectURL(img.src); });
      var x = document.createElement("button");
      x.type = "button"; x.textContent = "×"; x.title = "Remove";
      x.addEventListener("click", function(e){
        e.preventDefault(); e.stopPropagation();
        pics.splice(idx, 1); drawThumbs();
      });
      wrap.appendChild(img); wrap.appendChild(x); host.appendChild(wrap);
    });
    $("dropTxt").textContent = pics.length
      ? pics.length + (pics.length === 1 ? " photo" : " photos") + " — add more"
      : "Add photos of the strip";
  }

  function addFiles(list, max){
    Array.prototype.slice.call(list || []).forEach(function(f){
      if (f && /^image\//.test(f.type) && pics.length < max) pics.push(f);
    });
    drawThumbs();
  }

  function aiPrompt(){
    var dens = CFG.density.map(function(d){ return '"' + d.key + '" = ' + d.label; }).join("; ");
    var sites = CFG.sites.map(function(st){ return '"' + st.key + '" = ' + st.name; }).join("; ");
    return [
      "You are helping a land-clearing contractor in the Austin, Texas area price a job.",
      "He clears overgrown greenbelt strips behind suburban back fences: brush, briars,",
      "saplings, cedar. Read the photos (if any) and the description, then fill in his",
      "estimating form.",
      "",
      "Density keys: " + dens,
      "Dump site keys: " + sites,
      "Depth options he offers, in feet: " + CFG.depths.join(", "),
      "",
      "Reply with ONLY a JSON object with these keys. Use null for anything you cannot",
      "tell from what you were given — null means 'he will fill it in', and a wrong",
      "number is far worse than a null.",
      "  len        number  feet of fence line, ONLY if it is stated or countable. Photos",
      "                     alone almost never tell you this. Usually null.",
      "  depth      number  one of the depth options above, or null",
      "  dens       string  one of the density keys above, or null",
      "  trees      number  trees thicker than 6 inches that must come down, or null",
      "  crew       number  1 to 4 people, or null",
      "  haulAny    number  1 if material must leave the property, 0 if it stays, else null",
      "  haulPct    number  5-100, what percent of the job produces material worth hauling",
      "  access     number  1 for normal, " + CFG.extreme + " only for genuinely extreme access",
      "  terrain    number  1 flat, " + CFG.terrain2 + " uneven or rocky, " + CFG.terrain3 + " steep or drainage",
      "  site       string  one of the dump site keys, ONLY if stated. Usually null.",
      "  roundtrip  number  minutes round trip to the dump, ONLY if stated. Usually null.",
      "  read       string  2-3 sentences: what you see and what it means for the work.",
      "  guessed    array   short strings naming anything you inferred rather than were told.",
      "",
      "Example: {\"len\":null,\"depth\":10,\"dens\":\"medium\",\"trees\":2,\"crew\":2,\"haulAny\":1,",
      "\"haulPct\":80,\"access\":1,\"terrain\":1,\"site\":null,\"roundtrip\":null,",
      "\"read\":\"...\",\"guessed\":[\"density from the photos\"]}",
      "",
      "What the customer wants:",
      ($("brief").value || "").trim() || "(nothing written — go on the photos alone)"
    ].join("\n");
  }

  function setIf(id, v, valid){
    if (v === null || v === undefined || v === "") return false;
    if (valid && !valid(v)) return false;
    $(id).value = v;
    return true;
  }

  function applyRead(o){
    if (!o || typeof o !== "object") return [];
    var done = [];
    if (setIf("len", o.len, function(v){ return isFinite(v) && v > 0; })) done.push("fence line");
    if (o.depth != null) {
      var best = 0, bd = Infinity;
      CFG.depths.forEach(function(d, n){
        var diff = Math.abs(d - o.depth);
        if (diff < bd) { bd = diff; best = n; }
      });
      selected = best; done.push("depth");
    }
    if (setIf("dens", o.dens, function(v){ return !!densByKey(v); })) done.push("density");
    if (setIf("trees", o.trees, function(v){ return isFinite(v) && v >= 0; })) done.push("trees");
    if (setIf("crew", o.crew, function(v){ return isFinite(v) && v >= 1; })) done.push("crew");
    if (o.haulAny === 0 || o.haulAny === 1) { $("haulAny").value = String(o.haulAny); done.push("hauling"); }
    if (isFinite(o.haulPct) && o.haulPct > 0) {
      $("haulPct").value = Math.min(100, Math.max(5, Math.round(o.haulPct / 5) * 5));
      done.push("haul share");
    }
    if (isFinite(o.access) && o.access >= 1) $("access").value = o.access >= 1.05 ? String(CFG.extreme) : "1";
    if (isFinite(o.terrain) && o.terrain >= 1) {
      var t = [1, CFG.terrain2, CFG.terrain3].reduce(function(a, b){
        return Math.abs(b - o.terrain) < Math.abs(a - o.terrain) ? b : a;
      });
      $("terrain").value = String(t);
    }
    if (setIf("site", o.site, function(v){ return !!siteByKey(v); })) done.push("dump site");
    if (setIf("roundtrip", o.roundtrip, function(v){ return isFinite(v) && v >= 0; })) done.push("round trip");
    render();
    return done;
  }

  function aiUnavailable(msg){
    $("readJob").disabled = true;
    $("photos").disabled = true;
    $("drop").classList.add("disabled");
    $("aiStatus").textContent = msg;
  }

  function wireAI(sample, canImages, maxImages){
    $("readJob").disabled = false;
    $("photos").disabled = false;
    $("drop").classList.remove("disabled");
    $("aiStatus").textContent = "";
    var drop = $("drop"), input = $("photos");

    // limits() is the official answer, but some viewers under-report it, so
    // the drop zone stays live and one real rejection is what turns it off
    var imagesOk = canImages ? true : null;        // true / null unknown / false no
    var cap = maxImages || 4;

    function noPhotos(reason){
      imagesOk = false;
      pics.length = 0;
      drawThumbs();
      drop.hidden = true;
      $("brief").placeholder = "Describe the job in words — " +
        "this view of the page cannot send photos to Claude.";
      $("aiStatus").textContent = reason;
    }

    input.addEventListener("change", function(){
      addFiles(input.files, cap); input.value = "";
    });
    ["dragenter","dragover"].forEach(function(ev){
      drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add("over"); });
    });
    ["dragleave","drop"].forEach(function(ev){
      drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove("over"); });
    });
    drop.addEventListener("drop", function(e){
      if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files, cap);
    });
    document.addEventListener("paste", function(e){
      if (imagesOk === false || !e.clipboardData) return;
      var items = e.clipboardData.files;
      if (items && items.length) { addFiles(items, cap); e.preventDefault(); }
    });

    var ctl = null;
    $("stopJob").addEventListener("click", function(){ if (ctl) ctl.abort(); });

    function show(o){
      var done = applyRead(o);
      var box = $("aiOut");
      box.innerHTML = "";
      if (o && o.read) {
        var p1 = document.createElement("p");
        p1.textContent = String(o.read);
        box.appendChild(p1);
      }
      var g = Array.isArray(o && o.guessed) ? o.guessed.map(String) : [];
      var note = document.createElement("p");
      note.className = "guessed";
      note.textContent = "Filled in: " + (done.length ? done.join(", ") : "nothing it was sure of") +
        ". " + (g.length ? "Guessed: " + g.join("; ") + ". " : "") +
        "Check every field before you send a quote.";
      box.appendChild(note);
      box.hidden = false;
    }

    function failMsg(code){
      return code === "cancelled" ? ""
        : code === "not_granted" ? "You did not allow this page to use Claude."
        : code === "rate_limited" ? "Too many requests just now — try again in a minute."
        : code === "image_rejected" ? "One of those photos was too big or the wrong type."
        : code === "invalid_json" ? "It did not answer cleanly. Try again."
        : "It could not read the job. Try again, or fill the form yourself.";
    }

    function ask(withImages){
      var opts = {signal: ctl.signal, modelTier: "default", cache: false};
      if (withImages) opts.images = pics.slice(0, cap);
      return sample.json(aiPrompt(), opts);
    }

    function finish(){
      $("readJob").disabled = false;
      $("stopJob").hidden = true;
      ctl = null;
    }

    $("readJob").addEventListener("click", function(){
      var hasText = !!($("brief").value || "").trim();
      if (!pics.length && !hasText) {
        $("aiStatus").textContent = "Add a photo or describe the job first.";
        return;
      }
      ctl = new AbortController();
      $("readJob").disabled = true;
      $("stopJob").hidden = false;
      $("aiStatus").textContent = "Reading…";
      $("aiOut").hidden = true;

      var trying = pics.length > 0 && imagesOk !== false;

      ask(trying).then(function(o){
        show(o);
        $("aiStatus").textContent = "";
        finish();
      }).catch(function(e){
        var code = (e && e.code) || "";
        // this viewer cannot send photos after all — say so, then carry on
        // with the description rather than making him press the button again
        if (trying && code === "images_unavailable") {
          if (!hasText) {
            noPhotos("This view of the page cannot send photos to Claude. " +
                     "Describe the job in words instead.");
            finish();
            return;
          }
          noPhotos("Photos are not supported in this view — reading your description only…");
          ask(false).then(function(o){
            show(o);
            $("aiStatus").textContent =
              "Read from your description. This view cannot send photos to Claude.";
            finish();
          }).catch(function(e2){
            $("aiStatus").textContent = failMsg((e2 && e2.code) || "");
            finish();
          });
          return;
        }
        $("aiStatus").textContent = failMsg(code);
        finish();
      });
    });
  }

  // ---- capabilities ----
  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("db").then(function(db){
      if (!db) return;
      dbRef = db;
      return db.doc("settings/config").get().then(function(doc){
        if (doc && doc.data && Object.keys(doc.data).length) {
          mergeCfg(doc.data); cfgToForm(); render(); return;
        }
        return db.doc("settings/rates").get().then(function(old){
          if (old && old.data) { mergeCfg({rates: old.data}); cfgToForm(); render(); }
        });
      });
    }).catch(function(){});

    window.claude.use("sample").then(function(sample){
      if (!sample) { aiUnavailable(NO_AI); return; }
      return sample.limits().catch(function(){ return {}; }).then(function(lim){
        var im = lim && lim.images;
        if (im && Array.isArray(im.mediaTypes)) $("photos").accept = im.mediaTypes.join(",");
        wireAI(sample, !!im, (im && im.maxCount) || 4);
      });
    }).catch(function(){ aiUnavailable(NO_AI); });
  } else {
    aiUnavailable(NO_AI);
  }

  /* ==================================================================
     OPS — store, router, records
     ================================================================== */

  var DB = null, DBREADY = false, ASSETS = null;

  var CATS = [
    {k:"dump",     label:"Dump and disposal",      line:"Other expenses — disposal"},
    {k:"fuel",     label:"Fuel",                   line:"Car and truck expenses"},
    {k:"vehicle",  label:"Vehicle repair and tyres", line:"Car and truck expenses"},
    {k:"equip",    label:"Equipment and tools",    line:"Depreciation / Section 179"},
    {k:"consum",   label:"Saw consumables",        line:"Supplies"},
    {k:"rent",     label:"Equipment rent paid",    line:"Rent or lease — machinery"},
    {k:"ins",      label:"Insurance",              line:"Insurance (other than health)"},
    {k:"wages",    label:"Wages",                  line:"Wages"},
    {k:"ptax",     label:"Payroll taxes",          line:"Taxes and licenses"},
    {k:"ads",      label:"Advertising",            line:"Advertising"},
    {k:"prof",     label:"CPA, legal, filing fees",line:"Legal and professional services"},
    {k:"permits",  label:"Licences and permits",   line:"Taxes and licenses"},
    {k:"phone",    label:"Phone and software",     line:"Utilities / Office expense"},
    {k:"other",    label:"Other",                  line:"Other expenses"}
  ];

  function bizDefaults(){
    return {
      // the exact legal name as filed, comma included — it has to match the
      // formation documents on anything official
      legal:"Swanston Services, LLC", dba:"SWANSTON SERVICES", ein:"", nameControl:"",
      phone:"(512) 902-3213", email:"", addr:"",
      // `next` is gone: invoice numbers come from a Postgres sequence now, so a
      // counter kept in the settings document was both unused and misleading.
      prefix:"SS", termDays:14, taxRate:8.25, taxOn:false,
      payLink:"", payNote:"", invTerms:"Thank you. Please include the invoice number with payment.",
      fica:7.65, wc:11, futa:0.6, futaBase:7000, suta:2.7, sutaBase:9000,
      cats:CATS.slice()
    };
  }

  var BIZ = bizDefaults();
  var S = {customers:[], jobs:[], invoices:[], expenses:[], crew:[], hours:[]};

  // ---------- small helpers ----------
  function el(id){ return document.getElementById(id); }
  function usd(n){
    var v = Math.round((Number(n) || 0) * 100) / 100;
    return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US",
      {minimumFractionDigits:2, maximumFractionDigits:2});
  }
  function usd0(n){ return "$" + Math.round(Number(n) || 0).toLocaleString("en-US"); }
  function today(){ return new Date().toISOString().slice(0,10); }
  function addDays(iso, n){
    var d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + (Number(n) || 0));
    return d.toISOString().slice(0,10);
  }
  function nice(iso){
    if (!iso) return "—";
    var p = String(iso).slice(0,10).split("-");
    if (p.length !== 3) return iso;
    var m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return m[Number(p[1]) - 1] + " " + Number(p[2]) + ", " + p[0];
  }
  function shortDate(iso){
    if (!iso) return "—";
    var p = String(iso).slice(0,10).split("-");
    if (p.length !== 3) return iso;
    var m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return m[Number(p[1]) - 1] + " " + Number(p[2]);
  }
  function yearOf(iso){ return String(iso || "").slice(0,4); }
  function mkid(p){
    return p + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  }
  // This lands in innerHTML, so it has to actually escape. It did not before,
  // which let crew-supplied text run script in the owner's session.
  function esc(t){
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  // only http(s) and the blob paths we mint ourselves may become an href
  function safeUrl(u){
    var v = String(u == null ? "" : u).trim();
    // Only absolute http(s) and the blob paths we mint ourselves. The old
    // version also admitted any string starting with "/", which let a
    // protocol-relative "//evil.com/x" through to an external host.
    if (/^https?:\/\//i.test(v)) return v;
    if (/^\/_blob\//.test(v)) return v;
    if (/^\/[^\/]/.test(v)) return v;          // a real same-origin path, not "//host"
    return "";
  }
  function byId(list, id){
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function custName(id){
    var c = byId(S.customers, id);
    return c ? c.name : "—";
  }
  function catLabel(k){
    for (var i = 0; i < BIZ.cats.length; i++) if (BIZ.cats[i].k === k) return BIZ.cats[i].label;
    return k || "—";
  }
  function catLine(k){
    for (var i = 0; i < BIZ.cats.length; i++) if (BIZ.cats[i].k === k) return BIZ.cats[i].line;
    return "Other expenses";
  }

  // ---------- store ----------
  function put(coll, obj){
    var o = Object.assign({}, obj);
    var id = o.id || mkid(coll.charAt(0));
    delete o.id;
    if (!DB) { stash(coll, id, o); return Promise.resolve(id); }
    return DB.collection(coll).doc(id).set(o).then(function(){
      // Update what is on screen ourselves rather than waiting for the
      // subscription to push it back. The subscription needs Supabase realtime
      // switched on for the docs table; if it is not, the write still lands but
      // the page would sit there looking unchanged. The snapshot overwrites
      // this with the server's copy whenever it does arrive.
      if (S[coll]) stash(coll, id, o);
      return id;
    });
  }
  function drop(coll, id){
    if (!DB) return Promise.resolve();
    return DB.collection(coll).doc(id).delete().then(function(){
      if (S[coll]) {
        S[coll] = S[coll].filter(function(r){ return r.id !== id; });
        renderAll();
      }
    });
  }
  // offline fallback so the page still works without the store
  function stash(coll, id, o){
    o = Object.assign({id:id}, o);
    var list = S[coll], hit = byId(list, id);
    if (hit) Object.assign(hit, o); else list.push(o);
    renderAll();
  }
  function saveBiz(){
    if (!DB) return Promise.resolve();
    return DB.doc("settings/business").set(BIZ);
  }

  // PostgREST applies a server-side max-rows ceiling (1000 by default on
  // Supabase). Subscribing with no limit and no order meant that past that
  // many rows the page quietly received an arbitrary subset and totalled it up
  // as though it were everything. Ask for one more than the cap so the
  // truncation can be detected, order so the rows are at least the newest
  // ones, and say so on screen rather than reporting a wrong number.
  var PAGE_CAP = 1000;
  var TRUNCATED = {};
  // which field to take the newest rows by, where the collection has one
  var SORT_FIELD = {jobs:"date", expenses:"date", hours:"date", invoices:"issued"};
  function sub(name){
    try {
      var q = DB.collection(name);
      if (SORT_FIELD[name]) q = q.orderBy(SORT_FIELD[name], "desc");
      q.limit(PAGE_CAP + 1)
        .onSnapshot(function(snap){
        var docs = snap.docs;
        if (docs.length > PAGE_CAP) {
          TRUNCATED[name] = true;
          docs = docs.slice(0, PAGE_CAP);
        } else {
          delete TRUNCATED[name];
        }
        S[name] = docs.map(function(d){
          var o = Object.assign({}, d.data() || {});
          o.id = d.id;
          return o;
        });
        renderAll();
      }, function(){ /* terminal; keep what we have */ });
    } catch (e) {}
  }
  function truncatedNote(){
    var names = Object.keys(TRUNCATED);
    if (!names.length) return "";
    return "Showing only the " + PAGE_CAP + " most recent " + names.join(" and ") +
           " rows, so the totals below are incomplete. Export for the full set.";
  }

  function bootOps(){
    if (!(window.claude && typeof window.claude.use === "function")) {
      ME.admin = true; applyRole(); return;
    }
    window.claude.use("assets").then(function(a){ ASSETS = a; }).catch(function(){});
    window.claude.use("photos").then(function(a){ PHOTOBOX = a; }).catch(function(){});
    window.claude.use("jobs").then(function(a){ JOBS_RPC = a; }).catch(function(){});
    window.claude.use("invoices").then(function(a){ INVOICE_RPC = a; }).catch(function(){});

    var who = window.claude.use("user").then(function(u){
      // no identity available: the crew view cannot work anyway (submitting
      // needs a viewer id), and the db rules are the real boundary, so fall
      // back to the full UI rather than locking the owner out.
      if (!u) { ME.admin = true; return null; }
      try { if (u.canEdit && u.canEdit() === true) ME.admin = true; } catch (e) {}
      var jobs = [];
      try { jobs.push(u.id().then(function(id){ ME.id = id; })); } catch (e) {}
      try { jobs.push(Promise.resolve(u.me()).then(function(p){
        if (p && p.name) ME.name = p.name;
        if (p && p.crewId) ME.crewId = p.crewId;   // which crew record is them
      })); } catch (e) {}
      return Promise.all(jobs.map(function(p){ return p.catch(function(){}); }));
    }).catch(function(){ return null; });

    window.claude.use("db").then(function(db){
      if (!db) { ME.admin = true; applyRole(); return; }
      DB = db; DBREADY = true;
      // only an admin can read settings under the access rules, so the read IS the test
      return Promise.all([db.doc("settings/business").get().catch(function(){ return null; }), who])
        .then(function(r){
          var doc = r[0];
          if (doc && doc.exists) {
            ME.admin = true;
            BIZ = Object.assign(bizDefaults(), doc.data() || {});
            if (!Array.isArray(BIZ.cats) || !BIZ.cats.length) BIZ.cats = CATS.slice();
            bizToForm();
          }
          subShared();
          if (ME.admin) loadPeople();
          if (ME.admin) ["customers","jobs","invoices","expenses","crew","hours"].forEach(sub);
          ME.resolved = true;
          applyRole();
        });
    }).catch(function(){ ME.admin = true; applyRole(); });
  }

  // the three collections both sides can see
  function subShared(){
    [["joblist",   function(v){ JOBLIST = v; }],
     ["forms",     function(v){ FORMS = v; }],
     ["inbox",     function(v){ INBOX = v; }],
     ["jobphotos", function(v){ PHOTOS = v; }]].forEach(function(pair){
      try {
        DB.collection(pair[0]).onSnapshot(function(snap){
          pair[1](snap.docs.map(function(d){
            var o = Object.assign({}, d.data() || {}); o.id = d.id; return o;
          }));
          if (isAdminView()) renderAll();
          else { renderCrew2(); if (typeof fillCjJob === "function") fillCjJob(); }
        }, function(){});
      } catch (e) {}
    });
  }

  // ---------- money maths ----------
  // A crew record with no type is a contractor. That is the safe default here:
  // treating a contractor as an employee overstates cost on every job, while
  // the reverse only happens if the owner forgets to mark a real hire, which
  // the Crew tab asks about explicitly.
  // the reporting threshold for both 1099-NEC and 1099-MISC rents
  var NEC_MIN = 600;
  function isEmployee(person){
    return !!(person && person.type === "employee");
  }
  function workerType(person){
    return isEmployee(person) ? "employee" : "contractor";
  }

  function ratePack(){
    return {
      fica:(Number(BIZ.fica)||0)/100, wc:(Number(BIZ.wc)||0)/100,
      futa:(Number(BIZ.futa)||0)/100, futaBase:Number(BIZ.futaBase)||0,
      suta:(Number(BIZ.suta)||0)/100, sutaBase:Number(BIZ.sutaBase)||0
    };
  }
  // what one logged shift actually costs, with the wage bases respected
  function shiftCost(h){
    var p = ratePack();
    var person = byId(S.crew, h.crewId);

    var rate = Number(h.rate) || (person ? Number(person.rate) || 0 : 0);
    var wage = (Number(h.hours) || 0) * rate;

    // Employer payroll tax and workers comp are owed on EMPLOYEES. A 1099
    // contractor carries none of it, and loading 21% onto their hours made
    // every job margin read low. Anyone without an explicit type is treated
    // as a contractor, which is what this business actually engages.
    // a stamped workerType survives the crew record being deleted
    var emp = h.workerType ? h.workerType === "employee" : isEmployee(person);
    if (!emp) {
      return {wage:wage, burden:0, loaded:wage, rate:rate, pct:0, employee:false};
    }

    var yr = yearOf(h.date);
    var ytd = 0;
    S.hours.forEach(function(o){
      if (o.crewId !== h.crewId || yearOf(o.date) !== yr) return;
      if (o.date > h.date || (o.date === h.date && String(o.id) >= String(h.id))) return;
      var pr = byId(S.crew, o.crewId);
      if (!isEmployee(pr)) return;
      ytd += (Number(o.hours) || 0) * (Number(o.rate) || (pr ? Number(pr.rate) || 0 : 0));
    });
    var fica = wage * p.fica, wc = wage * p.wc;
    var futa = Math.min(wage, Math.max(0, p.futaBase - ytd)) * p.futa;
    var suta = Math.min(wage, Math.max(0, p.sutaBase - ytd)) * p.suta;
    var burden = fica + wc + futa + suta;
    return {wage:wage, burden:burden, loaded:wage + burden, rate:rate,
            pct: wage > 0 ? burden / wage : 0, employee:true};
  }
  function jobLabour(jobId){
    var w = 0, b = 0, hrs = 0;
    S.hours.forEach(function(h){
      if (h.jobId !== jobId) return;
      var c = shiftCost(h);
      w += c.wage; b += c.burden; hrs += Number(h.hours) || 0;
    });
    return {wage:w, burden:b, loaded:w + b, hours:hrs};
  }
  var MAT_CATS = ["fuel","consum","equip","vehicle"];
  var WAGE_CATS = ["wages","ptax"];

  // ONE classifier. Both the per-job margin and the yearly books sort expenses
  // with this, so the two can never disagree about what a receipt is.
  function bucketOf(cat){
    if (cat === "dump") return "dump";
    if (cat === "rent") return "rent";
    if (WAGE_CATS.indexOf(cat) >= 0) return "wage";
    if (MAT_CATS.indexOf(cat) >= 0) return "mat";
    return "other";
  }
  function emptyBuckets(){ return {dump:0, mat:0, rent:0, wage:0, other:0, total:0}; }

  // Split a job's logged expenses by what they are, so a real receipt can
  // replace the quote's estimate instead of being added on top of it.
  function jobExpenses(jobId){
    var out = emptyBuckets();
    S.expenses.forEach(function(e){
      if (e.jobId !== jobId) return;
      var a = Number(e.amount) || 0;
      out.total += a;
      out[bucketOf(e.cat)] += a;
    });
    return out;
  }

  // THE precedence rule, in one place: a real receipt replaces the figure the
  // quote builder estimated. No receipt, the estimate stands. Never both.
  function settle(actual, estimate){
    return actual > 0 ? actual : (Number(estimate) || 0);
  }

  function jobMath(j){
    var lab = jobLabour(j.id);
    var act = jobExpenses(j.id);
    var dump = settle(act.dump, j.dumpCost);
    var mat  = settle(act.mat,  j.materials);
    var rent = settle(act.rent, j.equipRent);
    var other = act.other;
    var price = Number(j.price) || 0;
    // A wages receipt against this job settles hours that lab already counted.
    // Counting both would be the same money twice; if no hours were ever logged
    // the receipt is the only record of the labour, so then it counts.
    var labour = lab.loaded > 0 ? lab.loaded : act.wage;
    var costs = dump + mat + rent + other + labour;
    return {price:price, dump:dump, mat:mat, rent:rent, other:other,
            actualised: act.dump > 0 || act.mat > 0 || act.rent > 0,
            labour:lab, labourCost:labour, costs:costs,
            left:price - costs, hours:lab.hours};
  }

  // The yearly figures, built the same way the per-job margin is: every pound
  // counted exactly once, receipts beating estimates, nothing subtracted on the
  // assumption that something else will add it back. The old books did that,
  // and a rent receipt on a job with no estimate fell out of profit entirely.
  function yearCosts(yr){
    var jobs = S.jobs.filter(function(j){ return yearOf(j.date) === yr; });
    var owned = {};
    jobs.forEach(function(j){ owned[j.id] = true; });

    var wages = 0, burden = 0, hours = 0;
    S.hours.forEach(function(h){
      if (yearOf(h.date) !== yr) return;
      var c = shiftCost(h);
      wages += c.wage; burden += c.burden; hours += Number(h.hours) || 0;
    });

    // expenses, split by whether a job in this year owns them
    var perJob = {}, loose = emptyBuckets();
    S.expenses.forEach(function(e){
      if (yearOf(e.date) !== yr) return;
      var a = Number(e.amount) || 0;
      var b = bucketOf(e.cat);
      if (e.jobId && owned[e.jobId]) {
        if (!perJob[e.jobId]) perJob[e.jobId] = emptyBuckets();
        perJob[e.jobId][b] += a;
      } else {
        loose[b] += a;                       // no job, or a job from another year
      }
    });

    var dump = loose.dump, mat = loose.mat, rent = loose.rent, other = loose.other;
    var wagePaid = loose.wage;
    jobs.forEach(function(j){
      var act = perJob[j.id] || emptyBuckets();
      dump += settle(act.dump, j.dumpCost);
      mat  += settle(act.mat,  j.materials);
      rent += settle(act.rent, j.equipRent);
      other += act.other;
      wagePaid += act.wage;
    });

    var labour = (wages + burden) > 0 ? (wages + burden) : wagePaid;
    return {dump:dump, mat:mat, rent:rent, other:other,
            wages:wages, burden:burden, wagePaid:wagePaid,
            labour:labour, fromHours:(wages + burden) > 0,
            hours:hours, total:dump + mat + rent + other + labour};
  }
  function invTotal(inv){
    var sub = (inv.lines || []).reduce(function(s, l){
      return s + (Number(l.qty) || 0) * (Number(l.rate) || 0);
    }, 0);
    var tax = inv.taxOn ? sub * ((Number(inv.taxRate) || 0) / 100) : 0;
    return {sub:sub, tax:tax, total:sub + tax};
  }
  function invStatus(inv){
    if (inv.paidDate) return "paid";
    if (inv.due && inv.due < today()) return "overdue";
    return "open";
  }

  // ---------- drawer ----------
  var dOnSave = null;
  function closeDrawer(){ el("scrim").hidden = true; dOnSave = null; }
  el("dClose").addEventListener("click", closeDrawer);
  el("scrim").addEventListener("mousedown", function(e){
    if (e.target === el("scrim")) closeDrawer();
  });
  document.addEventListener("keydown", function(e){
    if (e.key === "Escape" && !el("scrim").hidden) closeDrawer();
  });

  function field(spec, val){
    var w = document.createElement("div");
    w.className = "f" + (spec.wide ? " wide" : "");
    if (spec.type !== "check") {
      var lb = document.createElement("label");
      lb.textContent = spec.label; lb.htmlFor = "d_" + spec.k;
      if (spec.req) {
        var star = document.createElement("span");
        star.textContent = " *";
        star.style.color = "var(--flag)";
        star.title = "Required";
        lb.appendChild(star);
      }
      w.appendChild(lb);
    }
    var inp;
    if (spec.type === "select") {
      inp = document.createElement("select");
      (spec.opts || []).forEach(function(o){
        var op = document.createElement("option");
        op.value = o.v; op.textContent = o.t;
        inp.appendChild(op);
      });
      inp.value = val == null ? "" : String(val);
    } else if (spec.type === "textarea") {
      inp = document.createElement("textarea");
      inp.style.minHeight = "58px";
      inp.value = val == null ? "" : String(val);
    } else if (spec.type === "check") {
      w.className = "chk";
      inp = document.createElement("input");
      inp.type = "checkbox"; inp.checked = !!val;
      var lb2 = document.createElement("label");
      lb2.textContent = spec.label; lb2.htmlFor = "d_" + spec.k;
      w.appendChild(inp); w.appendChild(lb2);
      inp.id = "d_" + spec.k;
      return w;
    } else {
      inp = document.createElement("input");
      inp.type = spec.type || "text";
      if (spec.type === "number") { inp.step = spec.step || "0.01"; inp.inputMode = "decimal"; }
      inp.autocomplete = "off";
      if (spec.ph) inp.placeholder = spec.ph;
      inp.value = val == null ? "" : String(val);
    }
    inp.id = "d_" + spec.k;
    if (spec.req) { inp.required = true; inp.setAttribute("aria-required", "true"); }
    w.appendChild(inp);
    if (spec.hint) {
      var h = document.createElement("span");
      h.className = "hint"; h.textContent = spec.hint;
      w.appendChild(h);
    }
    return w;
  }

  // One delete control for the whole app. Two taps, a line saying what goes and
  // that it cannot be undone, and a failure that is reported rather than hidden
  // behind a closing drawer. window.confirm() does nothing inside the artifact
  // viewer, so the confirmation has to live here.
  function deleteButton(onDelete, warning){
    var box = document.createElement("span");
    box.style.display = "inline-flex";
    box.style.flexDirection = "column";
    box.style.gap = "5px";

    var del = document.createElement("button");
    del.type = "button"; del.className = "act danger"; del.textContent = "Delete";
    var msg = document.createElement("span");
    msg.className = "sub"; msg.style.marginTop = "0"; msg.hidden = true;

    var armed = false;
    del.addEventListener("click", function(){
      if (!armed) {
        armed = true;
        del.textContent = "Tap again to delete for good";
        msg.textContent = (warning ? warning + " " : "") + "This cannot be undone.";
        msg.hidden = false;
        return;
      }
      del.disabled = true;
      del.textContent = "Deleting…";
      Promise.resolve(onDelete()).then(closeDrawer, function(err){
        // the record is still there. Say so instead of closing as if it went.
        del.disabled = false;
        armed = false;
        del.textContent = "Delete";
        msg.textContent = "Could not delete it — nothing was removed. " +
          ((err && err.message) || "Check your connection and try again.");
        msg.hidden = false;
      });
    });
    box.appendChild(del); box.appendChild(msg);
    return box;
  }

  // What else points at this record, so the warning can say so out loud.
  function dependentsOf(coll, id){
    var bits = [];
    function count(list, key){
      var n = 0;
      list.forEach(function(r){ if (r[key] === id) n++; });
      return n;
    }
    if (coll === "jobs") {
      var h = count(S.hours, "jobId"), e = count(S.expenses, "jobId");
      var ph = (typeof PHOTOS !== "undefined" ? PHOTOS : []).filter(function(p){
        return p.jobId === id;
      }).length;
      if (h)  bits.push(h + (h === 1 ? " logged shift" : " logged shifts"));
      if (e)  bits.push(e + (e === 1 ? " expense" : " expenses"));
      if (ph) bits.push(ph + (ph === 1 ? " photo" : " photos"));
    } else if (coll === "crew") {
      var hh = count(S.hours, "crewId");
      if (hh) bits.push(hh + (hh === 1 ? " logged shift" : " logged shifts"));
    } else if (coll === "customers") {
      var j = count(S.jobs, "customerId"), i = count(S.invoices, "customerId");
      if (j) bits.push(j + (j === 1 ? " job" : " jobs"));
      if (i) bits.push(i + (i === 1 ? " invoice" : " invoices"));
    }
    if (!bits.length) return "";
    return bits.join(", ") + " will be left with nothing to belong to.";
  }

  function openForm(title, spec, values, onSave, onDelete, extra, warning){
    el("dTitle").textContent = title;
    var body = el("dBody");
    body.innerHTML = "";
    var grid = document.createElement("div");
    grid.className = "fields";
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fit,minmax(150px,1fr))";
    grid.style.gap = "13px";
    spec.forEach(function(s){ grid.appendChild(field(s, values ? values[s.k] : null)); });
    body.appendChild(grid);
    if (extra) body.appendChild(extra);

    var warn = document.createElement("div");
    warn.className = "flag red";
    warn.hidden = true;
    warn.setAttribute("role", "alert");
    body.appendChild(warn);

    var foot = document.createElement("div");
    foot.className = "dfoot";
    var save = document.createElement("button");
    save.type = "button"; save.className = "act"; save.textContent = "Save";
    save.addEventListener("click", function(){
      var out = {};
      spec.forEach(function(s){
        var e2 = el("d_" + s.k);
        if (!e2) return;
        out[s.k] = s.type === "check" ? e2.checked
                 : s.type === "number" ? (e2.value === "" ? null : parseFloat(e2.value))
                 : e2.value;
      });
      // Nothing used to be required, so a job with no date could be saved and
      // then broke every reporting view on the cast. Check before writing.
      var missing = spec.filter(function(sp){
        if (!sp.req) return false;
        var v = out[sp.k];
        return v === null || v === undefined || v === "" ||
               (sp.type === "number" && !(Number(v) > 0));
      });
      if (missing.length) {
        var names = missing.map(function(sp){ return sp.label; }).join(", ");
        warn.textContent = "Still needed: " + names;
        warn.hidden = false;
        var bad = el("d_" + missing[0].k);
        if (bad) bad.focus();
        return;
      }
      warn.hidden = true;
      save.disabled = true;
      var was = save.textContent;
      save.textContent = "Saving…";
      Promise.resolve(onSave(out)).then(closeDrawer, function(err){
        // the drawer used to close either way, so a failed save looked like a
        // successful one and the typing was lost
        save.disabled = false;
        save.textContent = was;
        warn.textContent = "Could not save: " +
          ((err && err.message) || "check your connection and try again.");
        warn.hidden = false;
      });
    });
    foot.appendChild(save);
    if (onDelete) {
      foot.appendChild(deleteButton(onDelete, warning));
    }
    body.appendChild(foot);
    el("scrim").hidden = false;
    var first = body.querySelector("input,select,textarea");
    if (first) first.focus();
  }

  function custOpts(){
    var o = S.customers.slice().sort(function(a,b){
      return String(a.name||"").localeCompare(String(b.name||""));
    }).map(function(c){ return {v:c.id, t:c.name || "(no name)"}; });
    o.unshift({v:"", t:"— pick a customer —"});
    o.push({v:"__new", t:"+ New customer…"});
    return o;
  }
  function jobOpts(){
    var o = S.jobs.slice().sort(function(a,b){
      return String(b.date||"").localeCompare(String(a.date||""));
    }).map(function(j){
      return {v:j.id, t:shortDate(j.date) + " · " + custName(j.customerId) + " · " + (j.title || "job")};
    });
    o.unshift({v:"", t:"— not tied to a job —"});
    return o;
  }
  function crewOpts(){
    return S.crew.map(function(c){ return {v:c.id, t:c.name}; });
  }
  function catOpts(){
    return BIZ.cats.map(function(c){ return {v:c.k, t:c.label}; });
  }

  // when a form picks "+ New customer", make one on the fly
  function resolveCustomer(val, typedName){
    if (val !== "__new") return Promise.resolve(val || "");
    var nm = (typedName || "").trim() || "New customer";
    return put("customers", {name:nm, created:today()});
  }

  /* ================= TODAY ================= */
  function renderToday(){
    var unpaid = S.invoices.filter(function(i){ return !i.paidDate; });
    var over = unpaid.filter(function(i){ return i.due && i.due < today(); });
    var owed = unpaid.reduce(function(s,i){ return s + invTotal(i).total; }, 0);
    var yr = String(new Date().getFullYear());
    var collected = S.invoices.filter(function(i){
      return i.paidDate && yearOf(i.paidDate) === yr;
    }).reduce(function(s,i){ return s + invTotal(i).total; }, 0);
    var spent = S.expenses.filter(function(e){ return yearOf(e.date) === yr; })
      .reduce(function(s,e){ return s + (Number(e.amount)||0); }, 0);
    var doneNot = S.jobs.filter(function(j){ return j.status === "done"; });

    el("todayWhen").textContent = nice(today());
    var tiles = [
      {k:"Owed to you", v:usd0(owed), s:unpaid.length + (unpaid.length===1?" invoice":" invoices"),
       cls: over.length ? "bad" : ""},
      {k:"Collected " + yr, v:usd0(collected), s:"paid invoices"},
      {k:"Spent " + yr, v:usd0(spent), s:"logged expenses"},
      {k:"Left over", v:usd0(collected - spent), s:"before tax and your pay",
       cls:(collected - spent) < 0 ? "bad" : ""},
      {k:"Jobs to invoice", v:String(doneNot.length), s:"finished, nothing sent",
       cls: doneNot.length ? "hot" : ""},
      {k:"Owed to crew", v:usd0(crewOwed().reduce(function(s,b){ return s + b.total; }, 0)),
       s:"approved, not yet paid"}
    ];
    el("todayTiles").innerHTML = "";
    tiles.forEach(function(t){
      var d = document.createElement("div");
      d.className = "tile" + (t.cls ? " " + t.cls : "");
      d.innerHTML = "";
      var k = document.createElement("div"); k.className = "k"; k.textContent = t.k;
      var v = document.createElement("div"); v.className = "v"; v.textContent = t.v;
      var s = document.createElement("div"); s.className = "s"; s.textContent = t.s;
      d.appendChild(k); d.appendChild(v); d.appendChild(s);
      el("todayTiles").appendChild(d);
    });

    var ob = el("owedRows"); ob.innerHTML = "";
    var sorted = unpaid.slice().sort(function(a,b){
      return String(a.due||"").localeCompare(String(b.due||""));
    });
    el("owedCount").textContent = sorted.length ? usd0(owed) + " total" : "";
    if (!sorted.length) ob.appendChild(emptyRow(6, "Nothing outstanding."));
    sorted.forEach(function(i){
      var st = invStatus(i);
      var tr = document.createElement("tr");
      tr.className = "click";
      tr.addEventListener("click", function(){ editInvoice(i); });
      cells(tr, [
        invNo(i), custName(i.customerId), shortDate(i.issued), shortDate(i.due),
        {n:usd0(invTotal(i).total)},
        {html:pill(st === "overdue" ? "bad" : "warn", st === "overdue" ? "overdue" : "unpaid")}
      ]);
      ob.appendChild(tr);
    });

    var ub = el("uninvRows"); ub.innerHTML = "";
    el("uninvCount").textContent = doneNot.length ? doneNot.length + "" : "";
    if (!doneNot.length) ub.appendChild(emptyRow(5, "Nothing waiting."));
    doneNot.forEach(function(j){
      var tr = document.createElement("tr");
      tr.className = "click";
      tr.addEventListener("click", function(){ invoiceFromJob(j); });
      cells(tr, [j.title || "Job", custName(j.customerId), shortDate(j.date),
                 {n:usd0(j.price)}, {html:pill("warn","invoice it")}]);
      ub.appendChild(tr);
    });

    var fl = el("todayFlags"); fl.innerHTML = "";
    if (!BIZ.ein) flag(fl, "No EIN saved yet. Add it in Setup once the LLC clears — it goes on every invoice.");
    if (BIZ.taxOn && !BIZ.ein) flag(fl, "Charging sales tax without a permit number on file. Get the permit before the next invoice goes out.", true);
    if (!BIZ.payLink) flag(fl, "No payment link saved. Invoices will print your manual payment note instead.");
    if (over.length) flag(fl, over.length + (over.length === 1 ? " invoice is" : " invoices are") + " past due — " +
      usd0(over.reduce(function(s,i){ return s + invTotal(i).total; },0)) + " outstanding.", true);
  }

  /* ---------- what the crew are owed ---------- */
  // Unpaid approved hours at their rate, plus anything they paid for
  // out of pocket that has not been reimbursed.
  function crewOwed(){
    var byPerson = {};
    function bucket(id){
      if (!byPerson[id]) byPerson[id] = {crewId:id, hours:0, labour:0, expenses:0, items:0};
      return byPerson[id];
    }
    S.hours.forEach(function(h){
      if (h.paidDate) return;
      // Deliberately NOT skipped when the crew record is gone. Dropping those
      // made the money owed disappear off the Today tile with no trace, which
      // is the worst way to forget to pay somebody. The row shows as unlinked
      // instead, with whatever rate was stored on the shift itself.
      var m = shiftCost(h);
      var b = bucket(h.crewId || "__none");
      b.hours += Number(h.hours) || 0;
      b.labour += m.wage;
      b.items += 1;
      if (!byId(S.crew, h.crewId)) {
        b.orphan = true;
        b.who = b.who || h.who || "";
        // an old shift with no stamped rate and no crew record left to read
        // one from. Say the rate is unknown rather than quietly calling it $0.
        if ((Number(h.hours) || 0) > 0 && m.wage === 0) b.unknownRate = true;
      }
    });
    S.expenses.forEach(function(e){
      if (!e.paidBy || e.reimbursedDate) return;
      var b = bucket(e.paidBy);
      b.expenses += Number(e.amount) || 0;
      b.items += 1;
    });
    return Object.keys(byPerson).map(function(k){
      var b = byPerson[k];
      b.total = b.labour + b.expenses;
      return b;
    }).filter(function(b){ return b.total > 0.005; })
      .sort(function(a,b){ return b.total - a.total; });
  }

  function settleCrew(b){
    var person = byId(S.crew, b.crewId);
    var name = person ? person.name : "this person";
    openForm("Pay " + name, [
      {k:"when", label:"Paid on", type:"date"},
      {k:"how",  label:"How", type:"select", opts:[
        {v:"",t:"—"},{v:"Zelle",t:"Zelle"},{v:"Check",t:"Check"},
        {v:"ACH",t:"Bank transfer"},{v:"Cash",t:"Cash"},{v:"Venmo",t:"Venmo"}]},
      {k:"note", label:"Note", wide:true,
       hint:"Marks " + b.items + " item" + (b.items === 1 ? "" : "s") +
            " as settled, totalling " + usd(b.total)}
    ], {when:today()}, function(v){
      var when = v.when || today();
      var jobs = [];
      S.hours.forEach(function(h){
        if (h.paidDate || h.crewId !== b.crewId) return;
        jobs.push(put("hours", Object.assign({}, h,
          {paidDate:when, paidHow:v.how || "", paidNote:v.note || ""})));
      });
      S.expenses.forEach(function(e){
        if (e.reimbursedDate || e.paidBy !== b.crewId) return;
        jobs.push(put("expenses", Object.assign({}, e, {reimbursedDate:when})));
      });
      return Promise.all(jobs);
    });
  }

  function renderOwed(){
    var list = crewOwed();
    var host = el("owedCrewRows");
    if (!host) return;
    var total = list.reduce(function(s,b){ return s + b.total; }, 0);
    el("owedCrewCount").textContent = total > 0 ? usd0(total) + " total" : "";
    host.innerHTML = "";
    if (!list.length) { host.appendChild(emptyRow(6, "Nobody is owed anything.")); return; }
    list.forEach(function(b){
      var person = byId(S.crew, b.crewId);
      var tr = document.createElement("tr");
      tr.className = "click";
      tr.addEventListener("click", function(){ settleCrew(b); });
      cells(tr, [
        person ? person.name
               : {html: esc(b.who || "deleted crew member") + " " + pill("bad", "unlinked")},
        {n: b.hours ? b.hours.toFixed(1) : "—"},
        {n: b.labour ? usd0(b.labour) : (b.unknownRate ? "rate unknown" : "—")},
        {n: b.expenses ? usd0(b.expenses) : "—"},
        {n: usd0(b.total)},
        {html: pill("warn", "pay")}
      ]);
      host.appendChild(tr);
    });
  }

  function flag(host, text, red){
    var d = document.createElement("div");
    d.className = "flag" + (red ? " red" : "");
    d.textContent = text;
    host.appendChild(d);
  }
  // Receipts are stored as a PATH now, not as a year-long signed URL, so the
  // link has to be minted when it is actually wanted. Render the anchor at once
  // and fill the href in when the signature comes back, so the table does not
  // wait on the network and an old row never shows a dead link.
  var SIGNED = {};
  function receiptLink(e){
    var id = e.receiptId || "";
    var legacy = safeUrl(e.receiptUrl);
    if (!id && !legacy) return "—";

    var a = document.createElement("a");
    a.target = "_blank"; a.rel = "noopener";
    a.textContent = "view";

    if (!id) { a.href = legacy; return {node:a}; }      // pre-existing row
    if (SIGNED[id] && SIGNED[id].until > Date.now()) {
      a.href = SIGNED[id].url;
      return {node:a};
    }
    a.href = legacy || "#";
    a.addEventListener("click", function(ev){
      if (a.dataset.ready === "1") return;
      ev.preventDefault();
      if (!ASSETS || !ASSETS.resign) { a.textContent = "unavailable"; return; }
      a.textContent = "opening…";
      ASSETS.resign(id, 300).then(function(url){
        SIGNED[id] = {url:url, until: Date.now() + 4 * 60 * 1000};
        a.href = url; a.dataset.ready = "1"; a.textContent = "view";
        window.open(url, "_blank", "noopener");
      }).catch(function(){
        a.textContent = "could not open";
      });
    });
    return {node:a};
  }

  function pill(cls, text){
    return '<span class="pill ' + cls + '">' + esc(text) + "</span>";
  }
  function emptyRow(span, text){
    var tr = document.createElement("tr");
    var td = document.createElement("td");
    td.colSpan = span; td.className = "empty"; td.textContent = text;
    tr.appendChild(td);
    return tr;
  }
  function cells(tr, list){
    list.forEach(function(c){
      var td = document.createElement("td");
      if (c && typeof c === "object") {
        if (c.node) { td.appendChild(c.node); }
        else if (c.n != null) { td.className = "num"; td.textContent = c.n; }
        else if (c.html != null) { td.innerHTML = c.html; }
        else td.textContent = "";
        if (c.cls) td.className = (td.className ? td.className + " " : "") + c.cls;
      } else td.textContent = c == null ? "" : String(c);
      tr.appendChild(td);
    });
  }
  function invNo(i){
    var n = Number(i.number) || 0;
    // an unsaved invoice has no number yet; a SAVED one with no number is a bug
    // that can no longer happen, since the database issues it in the same
    // transaction as the write
    return (i.prefix || BIZ.prefix || "") + "-" + (n > 0 ? n : "pending");
  }

  /* ================= JOBS ================= */
  function renderJobs(){
    var f = el("jobFilter").value, q = (el("jobSearch").value || "").toLowerCase();
    var list = S.jobs.slice().sort(function(a,b){
      return String(b.date||"").localeCompare(String(a.date||""));
    });
    if (f !== "all") list = list.filter(function(j){ return j.status === f; });
    if (q) list = list.filter(function(j){
      return (custName(j.customerId) + " " + (j.title||"") + " " + (j.addr||"")).toLowerCase().indexOf(q) >= 0;
    });
    el("jobCount").textContent = list.length + (list.length === 1 ? " job" : " jobs");
    var b = el("jobRows"); b.innerHTML = "";
    if (!list.length) { b.appendChild(emptyRow(7, "No jobs yet. Build a quote, or add one here.")); return; }
    list.forEach(function(j){
      var m = jobMath(j);
      var tr = document.createElement("tr");
      tr.className = "click";
      tr.addEventListener("click", function(){ editJob(j); });
      var st = j.status || "scheduled";
      var shots = PHOTOS.filter(function(p){ return p.jobId === j.id; }).length;
      var fromCrew = j.statusBy ? ' <span class="pill">from crew</span>' : "";
      cells(tr, [
        shortDate(j.date), custName(j.customerId),
        {html: esc(j.title || "—") + (shots ? ' <span class="pill ok">' + shots + " photo" +
               (shots === 1 ? "" : "s") + "</span>" : "")},
        {html:pill(st === "paid" ? "ok" : st === "done" ? "warn" : st === "started" ? "warn" : "", st) + fromCrew},
        {n:usd0(m.price)}, {n:usd0(m.costs)},
        {n:usd0(m.left), cls: m.left < 0 ? "" : ""}
      ]);
      b.appendChild(tr);
    });
  }

  function jobSpec(){
    return [
      {k:"date",  label:"Date", type:"date", req:true},
      {k:"customerId", label:"Customer", type:"select", opts:custOpts()},
      {k:"newCust", label:"…or a new name", ph:"only if you picked New customer"},
      {k:"title", label:"What it is", wide:true, ph:"Greenbelt strip, 120 ft"},
      {k:"addr",  label:"Property", wide:true},
      {k:"status",label:"Status", type:"select", opts:[
        {v:"scheduled",t:"Scheduled"},{v:"done",t:"Done"},
        {v:"invoiced",t:"Invoiced"},{v:"paid",t:"Paid"}]},
      {k:"price", label:"Price quoted ($)", type:"number", step:"25"},
      {k:"dumpCost", label:"Dump paid ($)", type:"number", step:"5"},
      {k:"materials", label:"Fuel, blades, etc ($)", type:"number", step:"5"},
      {k:"equipRent", label:"Crew truck/trailer ($)", type:"number", step:"25",
       hint:"Rent paid for equipment you do not own"},
      {k:"equipCrewId", label:"Whose equipment", type:"select",
       opts:[{v:"",t:"— yours —"}].concat(crewOpts()),
       hint:"Rent over $600 a year needs a 1099"},
      {k:"loads", label:"Loads hauled", type:"number", step:"1"},
      {k:"notes", label:"Notes", type:"textarea", wide:true}
    ];
  }
  function jobPhotoPanel(j){
    if (!j) return null;
    var mine = PHOTOS.filter(function(p){ return p.jobId === j.id; });
    var wrap = document.createElement("div");
    wrap.style.display = "grid"; wrap.style.gap = "7px";
    var h = document.createElement("p");
    h.className = "listhead"; h.style.padding = "0";
    h.textContent = mine.length ? "Crew photos (" + mine.length + ")" : "Crew photos";
    wrap.appendChild(h);
    if (!mine.length) {
      var none = document.createElement("p");
      none.className = "hint";
      none.textContent = "Nothing sent from the field yet.";
      wrap.appendChild(none);
      return wrap;
    }
    var strip = document.createElement("div");
    strip.className = "thumbs";
    mine.sort(function(a,b){ return String(a.at||"").localeCompare(String(b.at||"")); })
        .forEach(function(p){
      var a = document.createElement("a");
      a.href = p.url; a.target = "_blank"; a.rel = "noopener";
      a.className = "thumb"; a.style.display = "block";
      var img = document.createElement("img");
      img.alt = p.kind || ""; img.src = p.url;
      var tag = document.createElement("span");
      tag.textContent = (p.kind || "").toUpperCase();
      tag.style.cssText = "position:absolute;left:0;bottom:0;background:var(--ink);" +
        "color:var(--paper);font-family:var(--mono);font-size:8px;letter-spacing:.1em;padding:2px 4px;";
      a.appendChild(img); a.appendChild(tag);
      strip.appendChild(a);
    });
    wrap.appendChild(strip);
    return wrap;
  }

  function editJob(j){
    openForm(j ? "Job" : "New job", jobSpec(), j || {date:today(), status:"scheduled"},
      function(v){
        return resolveCustomer(v.customerId, v.newCust).then(function(cid){
          delete v.newCust;
          v.customerId = cid;
          if (j) v.id = j.id;
          return put("jobs", v).then(function(id){ return mirrorJob(id, v).then(function(){ return id; }); });
        });
      },
      j ? function(){ return unmirrorJob(j.id).then(function(){ return drop("jobs", j.id); }); } : null,
      jobPhotoPanel(j), j ? dependentsOf("jobs", j.id) : "");
  }
  el("newJob").addEventListener("click", function(){ editJob(null); });
  el("jobFilter").addEventListener("change", renderJobs);
  el("jobSearch").addEventListener("input", renderJobs);

  /* ================= EXPENSES ================= */
  function expYears(){
    var ys = {};
    S.expenses.forEach(function(e){ if (e.date) ys[yearOf(e.date)] = 1; });
    ys[String(new Date().getFullYear())] = 1;
    return Object.keys(ys).sort().reverse();
  }
  function fillYearSelects(){
    [["expYear", renderExpenses], ["bookYear", renderBooks]].forEach(function(pair){
      var sel = el(pair[0]), cur = sel.value;
      var ys = expYears();
      sel.innerHTML = "";
      ys.forEach(function(y){
        var o = document.createElement("option");
        o.value = y; o.textContent = y;
        sel.appendChild(o);
      });
      if (ys.indexOf(cur) >= 0) sel.value = cur;
    });
    var cs = el("expCat"), cur2 = cs.value;
    cs.innerHTML = '<option value="all">All categories</option>';
    BIZ.cats.forEach(function(c){
      var o = document.createElement("option");
      o.value = c.k; o.textContent = c.label;
      cs.appendChild(o);
    });
    if (cur2) cs.value = cur2;
  }

  function renderExpenses(){
    var yr = el("expYear").value || String(new Date().getFullYear());
    var cat = el("expCat").value || "all";
    var all = S.expenses.filter(function(e){ return yearOf(e.date) === yr; });
    var list = (cat === "all" ? all : all.filter(function(e){ return e.cat === cat; }))
      .slice().sort(function(a,b){ return String(b.date||"").localeCompare(String(a.date||"")); });

    var total = all.reduce(function(s,e){ return s + (Number(e.amount)||0); }, 0);
    var dump = all.filter(function(e){ return e.cat === "dump"; })
      .reduce(function(s,e){ return s + (Number(e.amount)||0); }, 0);
    var tiles = [
      {k:"Total out " + yr, v:usd0(total)},
      {k:"Dump fees", v:usd0(dump), s: total > 0 ? Math.round(dump/total*100) + "% of spend" : ""},
      {k:"Receipts on file", v:String(all.filter(function(e){ return e.receiptUrl; }).length) + " / " + all.length}
    ];
    var host = el("expTiles"); host.innerHTML = "";
    tiles.forEach(function(t){
      var d = document.createElement("div"); d.className = "tile";
      var k = document.createElement("div"); k.className = "k"; k.textContent = t.k;
      var v = document.createElement("div"); v.className = "v"; v.textContent = t.v;
      d.appendChild(k); d.appendChild(v);
      if (t.s) { var s = document.createElement("div"); s.className = "s"; s.textContent = t.s; d.appendChild(s); }
      host.appendChild(d);
    });

    el("expCount").textContent = list.length + " logged";
    var b = el("expRows"); b.innerHTML = "";
    if (!list.length) { b.appendChild(emptyRow(6, "Nothing logged for " + yr + ".")); return; }
    list.forEach(function(e){
      var tr = document.createElement("tr");
      tr.className = "click";
      tr.addEventListener("click", function(){ editExpense(e); });
      var job = e.jobId ? byId(S.jobs, e.jobId) : null;
      cells(tr, [
        shortDate(e.date), e.vendor || "—", catLabel(e.cat),
        job ? (custName(job.customerId) + " · " + (job.title||"job")) : "—",
        {n:usd(e.amount)},
        receiptLink(e)
      ]);
      b.appendChild(tr);
    });
  }

  function editExpense(e){
    var spec = [
      {k:"date", label:"Date", type:"date", req:true},
      {k:"vendor", label:"Paid to", ph:"Driftwood Recycling"},
      {k:"cat", label:"Category", type:"select", opts:catOpts()},
      {k:"amount", label:"Amount ($)", type:"number", step:"0.01", req:true},
      {k:"jobId", label:"Tie to a job", type:"select", opts:jobOpts(), wide:true},
      {k:"notes", label:"Notes", type:"textarea", wide:true}
    ];
    var extra = document.createElement("div");
    extra.style.display = "grid"; extra.style.gap = "7px";
    var lab = document.createElement("label");
    lab.className = "f";
    lab.innerHTML = '<label style="font-family:var(--mono);font-size:10px;letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--dim)">Receipt</label>';
    var fi = document.createElement("input");
    fi.type = "file";
    fi.accept = "image/*,application/pdf";
    var stat = document.createElement("span");
    stat.className = "hint";
    stat.textContent = e && e.receiptUrl ? "One on file — pick another to replace it."
      : (ASSETS ? "Optional. Stored with the expense." : "Receipt upload is not available in this view.");
    if (!ASSETS) fi.disabled = true;
    var pending = {url: e ? e.receiptUrl : null, id: e ? e.receiptId : null};
    fi.addEventListener("change", function(){
      var f = fi.files && fi.files[0];
      if (!f || !ASSETS) return;
      stat.textContent = "Uploading…";
      ASSETS.upload(f).then(function(r){
        pending.url = r.url; pending.id = r.id;
        stat.textContent = "Receipt attached.";
      }).catch(function(){ stat.textContent = "Could not upload that file."; });
    });
    lab.appendChild(fi); lab.appendChild(stat);
    extra.appendChild(lab);

    openForm(e ? "Expense" : "Add expense", spec,
      e || {date:today(), cat:"dump"},
      function(v){
        v.receiptUrl = pending.url || null;
        v.receiptId = pending.id || null;
        if (e) v.id = e.id;
        return put("expenses", v);
      },
      e ? function(){ return drop("expenses", e.id); } : null,
      extra);
  }
  el("newExp").addEventListener("click", function(){ editExpense(null); });
  el("expYear").addEventListener("change", renderExpenses);
  el("expCat").addEventListener("change", renderExpenses);

  /* ================= CREW ================= */
  function renderCrew(){
    var host = el("crewCards"); host.innerHTML = "";
    if (!S.crew.length) {
      var p = document.createElement("div");
      p.className = "tbl";
      p.innerHTML = '<div class="empty">Nobody on the books yet.</div>';
      host.appendChild(p);
    }
    var yr = String(new Date().getFullYear());
    S.crew.forEach(function(c){
      var mine = S.hours.filter(function(h){
        return h.crewId === c.id && yearOf(h.date) === yr;
      });
      var wage = 0, burden = 0, hrs = 0;
      mine.forEach(function(h){
        var m = shiftCost(h);
        wage += m.wage; burden += m.burden; hrs += Number(h.hours) || 0;
      });
      var rentJobs = S.jobs.filter(function(j){
        return j.equipCrewId === c.id && yearOf(j.date) === yr;
      });
      var rent = rentJobs.reduce(function(s,j){ return s + (Number(j.equipRent)||0); }, 0);

      var card = document.createElement("div");
      card.className = "tbl";
      var bar = document.createElement("div");
      bar.className = "bar";
      var nm = document.createElement("span");
      nm.textContent = c.name + "  ·  " + usd0(c.rate) + "/hr  ·  " + workerType(c);
      var ed = document.createElement("button");
      ed.className = "act ghost"; ed.type = "button"; ed.textContent = "Edit";
      ed.style.padding = "5px 11px"; ed.style.fontSize = "12px";
      ed.addEventListener("click", function(){ editCrew(c); });
      bar.appendChild(nm); bar.appendChild(ed);
      card.appendChild(bar);

      var t = document.createElement("div");
      t.className = "tiles";
      t.style.margin = "14px";
      [[yr + " hours", hrs.toFixed(1)],
       ["Wages", usd0(wage)],
       ["Employer tax + comp", usd0(burden)],
       ["Equipment rent", usd0(rent)],
       ["Costs you", usd0(wage + burden + rent)]].forEach(function(pair){
        var d = document.createElement("div"); d.className = "tile";
        var k = document.createElement("div"); k.className = "k"; k.textContent = pair[0];
        var v = document.createElement("div"); v.className = "v";
        v.style.fontSize = "22px"; v.textContent = pair[1];
        d.appendChild(k); d.appendChild(v); t.appendChild(d);
      });
      card.appendChild(t);

      var docs = document.createElement("div");
      docs.style.padding = "0 14px 14px";
      var dh = document.createElement("p");
      dh.className = "listhead"; dh.style.padding = "0 0 6px";
      dh.textContent = "Paperwork";
      docs.appendChild(dh);
      // This was hardcoded to employee forms (I-9, W-4) for everybody, while the
      // crew's own Forms tab served contractor forms. Both now read the one
      // paperwork table, keyed on what this person actually is.
      var pack = paperworkFor(c.type);
      dh.textContent = "Paperwork \u2014 " + pack.label;
      var youFile = document.createElement("p");
      youFile.className = "sub";
      youFile.style.margin = "0 0 8px";
      youFile.textContent = "You file: " + pack.youFile;
      docs.appendChild(youFile);
      var need = pack.forms.filter(function(f){ return f.collect; })
                           .map(function(f){ return [f.k, f.name]; });
      need.forEach(function(pair){
        var row = document.createElement("div");
        row.className = "docrow";
        var left = document.createElement("span");
        left.textContent = pair[1];
        var right = document.createElement("span");
        var stored = (c.docs || {})[pair[0]];
        if (stored && stored.url) {
          var a = document.createElement("a");
          a.href = stored.url; a.target = "_blank"; a.rel = "noopener";
          a.textContent = "on file";
          right.appendChild(a);
        } else {
          var up = document.createElement("input");
          up.type = "file"; up.accept = "image/*,application/pdf";
          up.style.fontSize = "12px"; up.style.maxWidth = "190px";
          if (!ASSETS) { up.disabled = true; }
          up.addEventListener("change", function(){
            var f = up.files && up.files[0];
            if (!f || !ASSETS) return;
            up.disabled = true;
            var lbl = up.previousSibling;
            ASSETS.upload(f).then(function(r){
              var d2 = Object.assign({}, c.docs || {});
              d2[pair[0]] = {url:r.url, id:r.id, at:today()};
              return put("crew", Object.assign({}, c, {docs:d2}));
            }).catch(function(err){
              // this used to fail completely silently: no file, no message
              up.disabled = false;
              var e2 = document.createElement("span");
              e2.className = "sub";
              e2.style.color = "var(--flag)";
              e2.textContent = "Upload failed — " +
                ((err && err.message) || "try again.") + " Nothing was saved.";
              if (up.parentNode) up.parentNode.appendChild(e2);
            });
          });
          right.appendChild(up);
        }
        row.appendChild(left); row.appendChild(right);
        docs.appendChild(row);
      });
      card.appendChild(docs);
      host.appendChild(card);
    });

    var list = S.hours.slice().sort(function(a,b){
      return String(b.date||"").localeCompare(String(a.date||""));
    }).slice(0, 60);
    el("hrCount").textContent = S.hours.length + " entries";
    var b = el("hrRows"); b.innerHTML = "";
    if (!list.length) { b.appendChild(emptyRow(7, "No hours logged yet.")); return; }
    list.forEach(function(h){
      var m = shiftCost(h);
      var job = h.jobId ? byId(S.jobs, h.jobId) : null;
      var person = byId(S.crew, h.crewId);
      var tr = document.createElement("tr");
      tr.className = "click";
      tr.addEventListener("click", function(){ editHours(h); });
      cells(tr, [
        shortDate(h.date), person ? person.name : "—",
        job ? (custName(job.customerId) + " · " + (job.title||"job")) : "—",
        {n:(Number(h.hours)||0).toFixed(1)}, {n:usd(m.wage)}, {n:usd(m.loaded)},
        {html: m.pct ? '<span class="pill">+' + Math.round(m.pct*100) + "%</span>" : ""}
      ]);
      b.appendChild(tr);
    });
  }

  function editCrew(c, presetType){
    var spec = [
      {k:"name", label:"Name", wide:true},
      {k:"type", label:"Hired as", type:"select", opts:[
        {v:"contractor",t:"Independent contractor (1099)"},
        {v:"employee",t:"Employee (W-2)"}],
       hint:"Employer payroll tax and workers comp are added to an employee's " +
            "hours and to every job they work. A contractor carries none of it."},
      {k:"rate", label:"Hourly rate ($)", type:"number", step:"0.5"},
      {k:"equipRate", label:"Equipment per job ($)", type:"number", step:"5",
       hint:"If they bring their own truck and trailer"},
      {k:"bonusPct", label:"Clean-job bonus (%)", type:"number", step:"0.5",
       hint:"Percent of job price"},
      {k:"phone", label:"Phone"},
      {k:"start", label:"Start date", type:"date"},
      {k:"status", label:"Status", type:"select", opts:[
        {v:"active",t:"Active"},{v:"inactive",t:"Inactive"}]},
      {k:"notes", label:"Notes", type:"textarea", wide:true}
    ];
    openForm(c ? (c.name || "Crew")
               : ("Add " + paperworkFor(presetType).label.toLowerCase().split(" (")[0]), spec,
      c || {status:"active", type:(presetType || "contractor"), rate:26,
            equipRate:100, bonusPct:5, start:today()},
      function(v){
        if (c) { v.id = c.id; v.docs = c.docs || {}; }
        return put("crew", v).then(function(id){
          // Mirror the type into the shared `forms` collection, which is the one
          // place a crew login may read. Without it their Forms tab has no way
          // to know whether to show them a W-9 or an I-9.
          return mirrorWorker(id, v).then(function(){ return id; });
        });
      },
      c ? function(){
            return unmirrorWorker(c.id).then(function(){ return drop("crew", c.id); });
          } : null,
      null, c ? dependentsOf("crew", c.id) : "");
  }
  function editHours(h){
    if (!S.crew.length) { alert("Add a crew member first."); return; }
    var spec = [
      {k:"date", label:"Date", type:"date", req:true},
      {k:"crewId", label:"Person", type:"select", opts:crewOpts()},
      {k:"jobId", label:"Job", type:"select", opts:jobOpts(), wide:true},
      {k:"hours", label:"Hours worked", type:"number", step:"0.25", req:true},
      {k:"rate", label:"Rate that day ($)", type:"number", step:"0.5",
       hint:"Blank uses their current rate"},
      {k:"note", label:"Note", wide:true}
    ];
    openForm(h ? "Hours" : "Log hours", spec,
      h || {date:today(), crewId:S.crew[0].id},
      function(v){
        if (h) v.id = h.id;
        // same reason as the inbox path: the shift records its own cost
        var person = byId(S.crew, v.crewId);
        if (!(Number(v.rate) > 0) && person) v.rate = Number(person.rate) || 0;
        if (person) { v.workerType = workerType(person); v.who = person.name || ""; }
        return put("hours", v);
      },
      h ? function(){ return drop("hours", h.id); } : null);
  }
  // Two buttons rather than one, because the choice is not a detail: it decides
  // the paperwork, who files what in January, and whether employer payroll tax
  // and workers comp land on every job this person works.
  el("newContractor").addEventListener("click", function(){ editCrew(null, "contractor"); });
  el("newEmployee").addEventListener("click", function(){ editCrew(null, "employee"); });
  el("logHours").addEventListener("click", function(){ editHours(null); });

  /* ================= BOOKS ================= */
  function renderBooks(){
    var yr = el("bookYear").value || String(new Date().getFullYear());
    var inv = S.invoices.filter(function(i){ return yearOf(i.issued) === yr; });
    var paid = S.invoices.filter(function(i){ return i.paidDate && yearOf(i.paidDate) === yr; });
    var exp = S.expenses.filter(function(e){ return yearOf(e.date) === yr; });

    var invoiced = inv.reduce(function(s,i){ return s + invTotal(i).total; }, 0);
    var collected = paid.reduce(function(s,i){ return s + invTotal(i).total; }, 0);
    var taxColl = paid.reduce(function(s,i){ return s + invTotal(i).tax; }, 0);

    // One calculator, shared with the per-job margin. Every figure below is a
    // part of c.total, so the tiles add up by hand — which the old pair of
    // gross-spend and net-of-reclassified-spend tiles did not.
    var c = yearCosts(yr);
    var profit = collected - taxColl - c.total;

    var tiles = [
      {k:"Invoiced", v:usd0(invoiced)},
      {k:"Collected", v:usd0(collected)},
      {k:"Sales tax collected", v:usd0(taxColl), s:"owed to the state, not yours"},
      {k:"Labour", v:usd0(c.labour),
       s:c.fromHours
          ? (c.burden > 0 ? usd0(c.wages) + " pay + " + usd0(c.burden) + " employer tax"
                          : c.hours.toFixed(1) + " hours, contractors")
          : "from wage receipts, no hours logged"},
      {k:"Everything else", v:usd0(c.dump + c.mat + c.rent + c.other),
       s:"dump, materials, rent and the rest"},
      {k:"Total costs", v:usd0(c.total), s:"labour plus everything else"},
      {k:"Rough profit", v:usd0(profit),
       s:"collected " + usd0(collected) + " less " + usd0(taxColl) +
         " tax held less " + usd0(c.total) + " costs"}
    ];
    var host = el("bookTiles"); host.innerHTML = "";
    // a wrong total announces itself rather than passing as fact
    var trunc = truncatedNote();
    if (trunc) {
      var tw = document.createElement("div");
      tw.className = "flag red";
      tw.style.gridColumn = "1 / -1";
      tw.textContent = trunc;
      host.appendChild(tw);
    }
    tiles.forEach(function(t){
      var d = document.createElement("div"); d.className = "tile";
      var k = document.createElement("div"); k.className = "k"; k.textContent = t.k;
      var v = document.createElement("div"); v.className = "v"; v.style.fontSize = "24px"; v.textContent = t.v;
      d.appendChild(k); d.appendChild(v);
      if (t.s) { var s = document.createElement("div"); s.className = "s"; s.textContent = t.s; d.appendChild(s); }
      host.appendChild(d);
    });

    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var ib = el("bookIncome"); ib.innerHTML = "";
    months.forEach(function(m, idx){
      var mm = yr + "-" + String(idx+1).padStart(2,"0");
      var a = inv.filter(function(i){ return String(i.issued||"").slice(0,7) === mm; })
        .reduce(function(s,i){ return s + invTotal(i).total; }, 0);
      var b2 = paid.filter(function(i){ return String(i.paidDate||"").slice(0,7) === mm; });
      var c2 = b2.reduce(function(s,i){ return s + invTotal(i).total; }, 0);
      var t2 = b2.reduce(function(s,i){ return s + invTotal(i).tax; }, 0);
      if (!a && !c2) return;
      var tr = document.createElement("tr");
      cells(tr, [m, {n:usd(a)}, {n:usd(c2)}, {n:usd(t2)}]);
      ib.appendChild(tr);
    });
    if (!ib.children.length) ib.appendChild(emptyRow(4, "No invoices in " + yr + "."));

    var eb = el("bookExp"); eb.innerHTML = "";
    var byCat = {};
    exp.forEach(function(e){ byCat[e.cat] = (byCat[e.cat] || 0) + (Number(e.amount)||0); });
    Object.keys(byCat).sort(function(a,b){ return byCat[b] - byCat[a]; }).forEach(function(k){
      var tr = document.createElement("tr");
      cells(tr, [catLabel(k), catLine(k), {n:usd(byCat[k])}]);
      eb.appendChild(tr);
    });
    if (!eb.children.length) eb.appendChild(emptyRow(3, "No expenses in " + yr + "."));

    var pb = el("bookPay"); pb.innerHTML = "";
    S.crew.forEach(function(c){
      var w = 0, bd = 0;
      S.hours.filter(function(h){ return h.crewId === c.id && yearOf(h.date) === yr; })
        .forEach(function(h){ var m = shiftCost(h); w += m.wage; bd += m.burden; });
      var r = S.jobs.filter(function(j){
        return j.equipCrewId === c.id && yearOf(j.date) === yr;
      }).reduce(function(s,j){ return s + (Number(j.equipRent)||0); }, 0);
      if (!w && !r) return;
      // W-2 was hardcoded for anyone with wages, which told the owner to file
      // the wrong form for a contractor. The form follows the worker type.
      var forms = [];
      if (w > 0) {
        if (isEmployee(c)) forms.push("W-2");
        else if (w >= NEC_MIN) forms.push("1099-NEC");
        else forms.push("1099-NEC if over " + usd0(NEC_MIN));
      }
      if (r >= NEC_MIN) forms.push("1099-MISC rents");
      var tr = document.createElement("tr");
      cells(tr, [c.name + (isEmployee(c) ? "" : "  (contractor)"),
                 {n:usd(w)}, {n:usd(r)}, {n:usd(bd)}, forms.join(" + ")]);
      pb.appendChild(tr);
    });
    if (!pb.children.length) pb.appendChild(emptyRow(5, "Nobody paid in " + yr + "."));

    var fb = el("bookFlags"); fb.innerHTML = "";
    if (taxColl > 0) flag(fb, usd0(taxColl) + " of sales tax is money you are holding for the state, not income. Keep it out of what you count as yours.");
    S.crew.forEach(function(c){
      var r = S.jobs.filter(function(j){ return j.equipCrewId === c.id && yearOf(j.date) === yr; })
        .reduce(function(s,j){ return s + (Number(j.equipRent)||0); }, 0);
      if (r >= NEC_MIN) flag(fb, c.name + " was paid " + usd0(r) + " in equipment rent this year — that needs a 1099-MISC (box 1, rents) by January 31.");
      // the one that is easy to forget: paying a contractor for their work
      var cw = 0;
      S.hours.filter(function(h){ return h.crewId === c.id && yearOf(h.date) === yr; })
        .forEach(function(h){ cw += shiftCost(h).wage; });
      if (!isEmployee(c) && cw >= NEC_MIN) {
        flag(fb, c.name + " was paid " + usd0(cw) + " for work this year as a contractor — " +
          "that needs a 1099-NEC by January 31, and you need their W-9 on file to fill it in.");
      }
    });
    var noRcpt = exp.filter(function(e){
      return !e.receiptUrl && !e.receiptId && (Number(e.amount)||0) >= 75;
    });
    if (noRcpt.length) flag(fb, noRcpt.length + " expense" + (noRcpt.length===1?"":"s") +
      " over $75 with no receipt attached. The IRS substantiation threshold is $75.");
  }
  el("bookYear").addEventListener("change", renderBooks);

  /* ---------- CSV export ---------- */
  function csvCell(v){
    var s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvOf(rows){
    return rows.map(function(r){ return r.map(csvCell).join(","); }).join("\n");
  }
  el("expCsv").addEventListener("click", function(){
    var yr = el("bookYear").value || String(new Date().getFullYear());
    var out = [];
    out.push(["SWANSTON SERVICES — " + yr]);
    out.push([]);
    out.push(["INVOICES"]);
    out.push(["Number","Customer","Issued","Due","Subtotal","Sales tax","Total","Paid on","Method"]);
    S.invoices.filter(function(i){ return yearOf(i.issued) === yr; }).forEach(function(i){
      var t = invTotal(i);
      out.push([invNo(i), custName(i.customerId), i.issued, i.due,
                t.sub.toFixed(2), t.tax.toFixed(2), t.total.toFixed(2),
                i.paidDate || "", i.method || ""]);
    });
    out.push([]);
    out.push(["EXPENSES"]);
    out.push(["Date","Paid to","Category","Tax line","Job","Amount","Receipt"]);
    S.expenses.filter(function(e){ return yearOf(e.date) === yr; }).forEach(function(e){
      var j = e.jobId ? byId(S.jobs, e.jobId) : null;
      out.push([e.date, e.vendor, catLabel(e.cat), catLine(e.cat),
                j ? (custName(j.customerId) + " " + (j.title||"")) : "",
                (Number(e.amount)||0).toFixed(2), e.receiptUrl || ""]);
    });
    out.push([]);
    out.push(["HOURS AND PAY"]);
    out.push(["Date","Person","Job","Hours","Rate","Wage","Employer tax + comp","Total cost"]);
    S.hours.filter(function(h){ return yearOf(h.date) === yr; }).forEach(function(h){
      var m = shiftCost(h);
      var p = byId(S.crew, h.crewId);
      var j = h.jobId ? byId(S.jobs, h.jobId) : null;
      out.push([h.date, p ? p.name : "", j ? (custName(j.customerId) + " " + (j.title||"")) : "",
                (Number(h.hours)||0).toFixed(2), m.rate.toFixed(2),
                m.wage.toFixed(2), m.burden.toFixed(2), m.loaded.toFixed(2)]);
    });
    out.push([]);
    out.push(["JOBS"]);
    out.push(["Date","Customer","Job","Status","Price","Dump","Materials","Equip rent","Other","Labour loaded","Left"]);
    S.jobs.filter(function(j){ return yearOf(j.date) === yr; }).forEach(function(j){
      var m = jobMath(j);
      out.push([j.date, custName(j.customerId), j.title, j.status,
                m.price.toFixed(2), m.dump.toFixed(2), m.mat.toFixed(2), m.rent.toFixed(2),
                m.other.toFixed(2), m.labour.loaded.toFixed(2), m.left.toFixed(2)]);
    });
    var blob = new Blob([csvOf(out)], {type:"text/csv"});
    saveBlob(blob, "Swanston books " + yr + ".csv");
  });

  function saveBlob(blob, filename){
    function fallback(){
      try {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
      } catch (e) {}
    }
    if (window.claude && typeof window.claude.use === "function") {
      window.claude.use("downloads").then(function(dl){
        if (!dl) { fallback(); return; }
        return dl.save({filename:filename, data:blob}).catch(function(){});
      }).catch(fallback);
    } else fallback();
  }

  /* ================= SETUP ================= */
  var BIZ_FIELDS = [
    ["s_legal","legal","t"],["s_dba","dba","t"],["s_ein","ein","t"],
    ["s_phone","phone","t"],["s_email","email","t"],["s_addr","addr","t"],
    // "s_next" is gone with the local counter: the sequence is the authority
    ["s_nameControl","nameControl","t"],
    ["s_prefix","prefix","t"],["s_terms","termDays","n"],
    ["s_tax","taxRate","n"],["s_taxon","taxOn","c"],
    ["s_paylink","payLink","t"],["s_paynote","payNote","t"],["s_invterms","invTerms","t"],
    ["s_fica","fica","n"],["s_wc","wc","n"],["s_futa","futa","n"],
    ["s_futab","futaBase","n"],["s_suta","suta","n"],["s_sutab","sutaBase","n"]
  ];
  function bizToForm(){
    BIZ_FIELDS.forEach(function(f){
      var e2 = el(f[0]);
      if (!e2) return;
      if (f[2] === "c") e2.checked = !!BIZ[f[1]];
      else e2.value = BIZ[f[1]] == null ? "" : BIZ[f[1]];
    });
    renderCats(); renderForms(); renderPeople();
  }
  function formToBiz(){
    BIZ_FIELDS.forEach(function(f){
      var e2 = el(f[0]);
      if (!e2) return;
      if (f[2] === "c") BIZ[f[1]] = e2.checked;
      else if (f[2] === "n") BIZ[f[1]] = e2.value === "" ? 0 : parseFloat(e2.value);
      else BIZ[f[1]] = e2.value;
    });
  }
  function renderCats(){
    var host = el("catRows"); host.innerHTML = "";
    BIZ.cats.forEach(function(c, i){
      var row = document.createElement("div");
      row.className = "lrow";
      [["Category", "label"], ["Where it lands on the return", "line"]].forEach(function(pair){
        var w = document.createElement("div"); w.className = "f";
        var lb = document.createElement("label"); lb.textContent = pair[0];
        var inp = document.createElement("input");
        inp.type = "text"; inp.value = c[pair[1]] || ""; inp.autocomplete = "off";
        inp.addEventListener("input", function(){ c[pair[1]] = inp.value; });
        w.appendChild(lb); w.appendChild(inp); row.appendChild(w);
      });
      if (BIZ.cats.length > 1) {
        var d = document.createElement("button");
        d.type = "button"; d.className = "del"; d.textContent = "Remove";
        d.addEventListener("click", function(){ BIZ.cats.splice(i,1); renderCats(); });
        row.appendChild(d);
      }
      host.appendChild(row);
    });
  }
  function renderForms(){
    var host = el("formRows"); host.innerHTML = "";
    var list = FORMS.length ? FORMS : formDefaults();
    list.forEach(function(f, i){
      var row = document.createElement("div");
      row.className = "lrow";
      [["Form", "name", true], ["Who needs it", "who", false],
       ["Link to the official form", "url", true],
       ["What to do with it", "note", true]].forEach(function(spec){
        var w = document.createElement("div");
        w.className = "f" + (spec[2] ? " wide" : "");
        var lb = document.createElement("label"); lb.textContent = spec[0];
        var inp = document.createElement("input");
        inp.type = "text"; inp.value = f[spec[1]] || ""; inp.autocomplete = "off";
        inp.addEventListener("input", function(){ f[spec[1]] = inp.value; });
        w.appendChild(lb); w.appendChild(inp); row.appendChild(w);
      });
      var d = document.createElement("button");
      d.type = "button"; d.className = "del"; d.textContent = "Remove";
      d.addEventListener("click", function(){ list.splice(i,1); FORMS = list; renderForms(); });
      row.appendChild(d);
      host.appendChild(row);
    });
    FORMS = list;
  }
  el("addForm").addEventListener("click", function(){
    FORMS = (FORMS.length ? FORMS : formDefaults()).concat(
      [{k:"f" + Date.now().toString(36), name:"New form", who:"", url:"", note:""}]);
    renderForms();
  });
  el("saveForms").addEventListener("click", function(){
    if (!DB) { el("formStatus").textContent = "Not connected."; return; }
    el("formStatus").textContent = "Saving…";
    Promise.all(FORMS.map(function(f, i){
      var id = f.id || f.k || ("f" + i);
      var body = Object.assign({}, f); delete body.id;
      body.order = i;
      return DB.collection("forms").doc(id).set(body);
    })).then(function(){ el("formStatus").textContent = "Saved. The crew see this list."; })
      .catch(function(){ el("formStatus").textContent = "Could not save."; });
  });
  el("previewCrew").addEventListener("click", function(){
    PREVIEW = true; applyRole();
  });

  el("addCat").addEventListener("click", function(){
    BIZ.cats.push({k:"c" + Date.now().toString(36), label:"New category", line:"Other expenses"});
    renderCats();
  });
  el("saveSetup").addEventListener("click", function(){
    formToBiz();
    el("setupStatus").textContent = "Saving…";
    saveBiz().then(function(){
      el("setupStatus").textContent = DB ? "Saved." : "Saved for this session only.";
      fillYearSelects(); renderAll();
    }).catch(function(){ el("setupStatus").textContent = "Could not save."; });
  });


  /* ---------- people and roles ---------- */
  var PEOPLE = [];
  var PEOPLE_ERR = "";

  function loadPeople(){
    if (!DB || !ME.admin || !window.__swanstonPeople) return Promise.resolve();
    return window.__swanstonPeople().then(function(list){
      PEOPLE = list || [];
      PEOPLE_ERR = "";
      renderPeople();
    }).catch(function(err){
      // "Nobody else has an account yet" is a lie when the query simply failed
      PEOPLE_ERR = (err && err.message) || "could not read the account list";
      renderPeople();
    });
  }

  function renderPeople(){
    var host = el("peopleRows");
    if (!host) return;
    host.innerHTML = "";
    if (!PEOPLE.length) {
      var p = document.createElement("p");
      p.className = "empty";
      p.textContent = PEOPLE_ERR
        ? "Could not load the account list: " + PEOPLE_ERR + ". Reload the page."
        : "Nobody else has an account yet.";
      if (PEOPLE_ERR) p.style.color = "var(--flag)";
      host.appendChild(p);
      return;
    }
    PEOPLE.slice().sort(function(a,b){
      return String(a.full_name || a.email || "").localeCompare(String(b.full_name || b.email || ""));
    }).forEach(function(u){
      var me = ME.id && u.id === ME.id;
      var row = document.createElement("div");
      row.className = "docrow";
      row.style.alignItems = "center";

      var left = document.createElement("div");
      var nm = document.createElement("div");
      nm.style.cssText = "font-weight:600;color:var(--ink)";
      nm.textContent = (u.full_name || "(no name)") + (me ? "  \u2014 you" : "");
      var em = document.createElement("div");
      em.style.cssText = "font-family:var(--mono);font-size:11.5px;color:var(--dim)";
      em.textContent = u.email || u.id.slice(0, 12);
      left.appendChild(nm); left.appendChild(em);

      var right = document.createElement("div");
      right.style.cssText = "display:flex;align-items:center;gap:9px";
      var tag = document.createElement("span");
      tag.className = "pill " + (u.role === "owner" ? "warn" : "");
      tag.textContent = u.role === "owner" ? "full access" : "crew only";
      right.appendChild(tag);

      if (!me) {
        var btn = document.createElement("button");
        btn.type = "button"; btn.className = "act ghost";
        btn.style.cssText = "padding:4px 10px;font-size:12px";
        btn.textContent = u.role === "owner" ? "Make crew only" : "Give full access";
        btn.addEventListener("click", function(){
          var next = u.role === "owner" ? "crew" : "owner";
          if (next === "owner") {
            btn.textContent = "Tap again to confirm";
            btn.onclick = function(){ setRole(u, next); };
            return;
          }
          setRole(u, next);
        });
        right.appendChild(btn);
      }
      row.appendChild(left); row.appendChild(right);
      host.appendChild(row);
    });
  }

  function setRole(u, role){
    if (!window.__swanstonSetRole) return;
    window.__swanstonSetRole(u.id, role).then(function(){
      u.role = role;
      renderPeople();
    }).catch(function(){
      el("setupStatus").textContent = "Could not change that.";
    });
  }

  /* ================= router ================= */
  function show(tab){
    document.querySelectorAll(".nav button").forEach(function(b){
      b.setAttribute("aria-selected", b.getAttribute("data-tab") === tab ? "true" : "false");
    });
    document.querySelectorAll(".page").forEach(function(p){
      p.hidden = p.getAttribute("data-page") !== tab;
    });
    window.scrollTo(0, 0);
    try { localStorage.setItem("sw_ops_tab", tab); } catch (e) {}
  }
  document.querySelectorAll(".nav button[data-tab]").forEach(function(b){
    b.addEventListener("click", function(){ show(b.getAttribute("data-tab")); });
  });
  ["signOutOwner","signOutCrew"].forEach(function(id){
    var b = el(id);
    if (b) b.addEventListener("click", function(){
      if (window.swanstonSignOut) window.swanstonSignOut();
    });
  });

  var renderQueued = false;
  function renderAll(){
    if (renderQueued) return;
    renderQueued = true;
    setTimeout(function(){
      renderQueued = false;
      try {
        fillYearSelects();
        renderToday(); renderJobs(); renderInvoices();
        renderExpenses(); renderCrew(); renderBooks(); renderInbox(); renderOwed();
      } catch (e) {}
    }, 0);
  }

  /* ==================================================================
     INVOICES
     ================================================================== */

  function renderInvoices(){
    var f = el("invFilter").value;
    var list = S.invoices.slice().sort(function(a,b){
      return (Number(b.number)||0) - (Number(a.number)||0);
    });
    if (f !== "all") list = list.filter(function(i){
      var st = invStatus(i);
      return f === "open" ? st !== "paid" : st === f;
    });
    el("invCount").textContent = list.length + (list.length === 1 ? " invoice" : " invoices");
    // the sequence is the only authority on the next number, and only the
    // database knows it, so do not pretend to show it from local settings
    el("invNextNote").textContent =
      "Numbers are issued by the database when you save, so two devices can " +
      "never be handed the same one.";

    var b = el("invRows"); b.innerHTML = "";
    if (!list.length) { b.appendChild(emptyRow(7, "No invoices yet.")); return; }
    list.forEach(function(i){
      var t = invTotal(i), st = invStatus(i);
      var tr = document.createElement("tr");
      tr.className = "click";
      tr.addEventListener("click", function(ev){
        if (ev.target && ev.target.nodeName === "BUTTON") return;
        editInvoice(i);
      });
      var td = [
        invNo(i), custName(i.customerId), shortDate(i.issued), shortDate(i.due),
        {n:usd(t.total)},
        {html:pill(st === "paid" ? "ok" : st === "overdue" ? "bad" : "warn", st)}
      ];
      cells(tr, td);
      var last = document.createElement("td");
      var pdf = document.createElement("button");
      pdf.type = "button"; pdf.className = "act ghost";
      pdf.style.padding = "4px 10px"; pdf.style.fontSize = "12px";
      pdf.textContent = "PDF";
      pdf.addEventListener("click", function(ev){ ev.stopPropagation(); makeInvoicePdf(i); });
      last.appendChild(pdf);
      tr.appendChild(last);
      b.appendChild(tr);
    });
  }
  el("invFilter").addEventListener("change", renderInvoices);

  function blankInvoice(){
    return {
      prefix: BIZ.prefix || "SS",
      number: 0,                 // the database fills this in on save
      customerId: "", jobId: "",
      issued: today(), due: addDays(today(), BIZ.termDays || 14),
      lines: [{desc:"", qty:1, rate:null}],
      taxOn: !!BIZ.taxOn, taxRate: Number(BIZ.taxRate) || 0,
      paidDate:"", method:"", notes:""
    };
  }

  function editInvoice(inv){
    var isNew = !inv || !inv.id;
    var v = Object.assign(blankInvoice(), inv || {});
    v.lines = (v.lines && v.lines.length ? v.lines : [{desc:"", qty:1, rate:null}])
      .map(function(l){ return Object.assign({}, l); });

    // Don't show "SS-?" on a new one. The number is issued by the database when
    // it saves, so there is nothing honest to put here until then.
    el("dTitle").textContent = isNew ? "New invoice" : invNo(v);
    var body = el("dBody");
    body.innerHTML = "";

    function nval(id){
      var x = el(id); var n = parseFloat(x ? x.value : "");
      return isFinite(n) ? n : 0;
    }

    // --- header fields ---
    var grid = document.createElement("div");
    grid.className = "fields";
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fit,minmax(150px,1fr))";
    grid.style.gap = "13px";
    grid.style.padding = "0";
    [
      {k:"customerId", label:"Customer", type:"select", opts:custOpts(), wide:true},
      {k:"newCust", label:"…or a new name", ph:"only if you picked New customer"},
      {k:"jobId", label:"Job", type:"select", opts:jobOpts(), wide:true},
      {k:"issued", label:"Issued", type:"date"},
      {k:"due", label:"Due", type:"date"},
      {k:"number", label:"Invoice number", type:"number", step:"1"}
    ].forEach(function(s){ grid.appendChild(field(s, v[s.k])); });
    body.appendChild(grid);

    // --- line items ---
    var lh = document.createElement("p");
    lh.className = "listhead"; lh.style.padding = "4px 0 0";
    lh.textContent = "What they are paying for";
    body.appendChild(lh);

    var linesHost = document.createElement("div");
    linesHost.className = "lines";
    body.appendChild(linesHost);

    function readLines(){
      var out = [];
      linesHost.querySelectorAll(".lineitem").forEach(function(row){
        var d = row.querySelector(".ld").value;
        var q = parseFloat(row.querySelector(".lq").value);
        var r = parseFloat(row.querySelector(".lr").value);
        if (!d && !isFinite(r)) return;
        out.push({desc:d, qty:isFinite(q) ? q : 1, rate:isFinite(r) ? r : 0});
      });
      return out;
    }
    function drawLines(){
      linesHost.innerHTML = "";
      v.lines.forEach(function(l, idx){
        var row = document.createElement("div");
        row.className = "lineitem";
        var d = document.createElement("input");
        d.className = "ld"; d.type = "text"; d.placeholder = "Description";
        d.value = l.desc || ""; d.autocomplete = "off";
        var q = document.createElement("input");
        q.className = "lq"; q.type = "number"; q.step = "0.25"; q.placeholder = "Qty";
        q.value = l.qty == null ? 1 : l.qty;
        var r = document.createElement("input");
        r.className = "lr"; r.type = "number"; r.step = "0.01"; r.placeholder = "Rate";
        r.value = l.rate == null ? "" : l.rate;
        var x = document.createElement("button");
        x.type = "button"; x.className = "x"; x.textContent = "×"; x.title = "Remove";
        x.addEventListener("click", function(){
          v.lines = readLines(); v.lines.splice(idx,1);
          if (!v.lines.length) v.lines = [{desc:"", qty:1, rate:null}];
          drawLines(); totals();
        });
        [d,q,r].forEach(function(i2){ i2.addEventListener("input", totals); });
        row.appendChild(d); row.appendChild(q); row.appendChild(r); row.appendChild(x);
        linesHost.appendChild(row);
      });
    }
    var addLine = document.createElement("button");
    addLine.type = "button"; addLine.className = "act ghost";
    addLine.textContent = "Add a line";
    addLine.addEventListener("click", function(){
      v.lines = readLines(); v.lines.push({desc:"", qty:1, rate:null});
      drawLines(); totals();
    });
    body.appendChild(addLine);

    // --- tax + totals ---
    var taxWrap = document.createElement("div");
    taxWrap.className = "fields";
    taxWrap.style.display = "grid";
    taxWrap.style.gridTemplateColumns = "repeat(auto-fit,minmax(150px,1fr))";
    taxWrap.style.gap = "13px"; taxWrap.style.padding = "0";
    taxWrap.appendChild(field({k:"taxOn", label:"Charge Texas sales tax", type:"check"}, v.taxOn));
    taxWrap.appendChild(field({k:"taxRate", label:"Rate (%)", type:"number", step:"0.125"}, v.taxRate));
    body.appendChild(taxWrap);

    var tot = document.createElement("div");
    tot.className = "totbox";
    body.appendChild(tot);
    function totals(){
      var t = invTotal({lines:readLines(), taxOn:el("d_taxOn").checked, taxRate:nval("d_taxRate")});
      tot.innerHTML = "";
      [["Subtotal", usd(t.sub)],
       ["Sales tax", el("d_taxOn").checked ? usd(t.tax) : "not charged"]].forEach(function(p){
        var r = document.createElement("div"); r.className = "r";
        var a = document.createElement("span"); a.textContent = p[0];
        var b2 = document.createElement("span"); b2.textContent = p[1];
        r.appendChild(a); r.appendChild(b2); tot.appendChild(r);
      });
      var r2 = document.createElement("div"); r2.className = "r big";
      var a2 = document.createElement("span"); a2.textContent = "Total due";
      var b3 = document.createElement("span"); b3.textContent = usd(t.total);
      r2.appendChild(a2); r2.appendChild(b3); tot.appendChild(r2);
    }

    // --- payment ---
    var pay = document.createElement("div");
    pay.className = "fields";
    pay.style.display = "grid";
    pay.style.gridTemplateColumns = "repeat(auto-fit,minmax(150px,1fr))";
    pay.style.gap = "13px"; pay.style.padding = "0";
    pay.appendChild(field({k:"paidDate", label:"Paid on", type:"date",
      hint:"Leave blank until the money lands"}, v.paidDate));
    pay.appendChild(field({k:"method", label:"How they paid", type:"select", opts:[
      {v:"",t:"—"},{v:"Card",t:"Card"},{v:"ACH",t:"Bank transfer"},
      {v:"Zelle",t:"Zelle"},{v:"Check",t:"Check"},{v:"Cash",t:"Cash"},
      {v:"Venmo",t:"Venmo"}]}, v.method));
    pay.appendChild(field({k:"notes", label:"Notes on the invoice", type:"textarea", wide:true}, v.notes));
    body.appendChild(pay);

    drawLines();

    // --- footer ---
    var foot = document.createElement("div");
    foot.className = "dfoot";

    function gather(){
      var out = Object.assign({}, v);
      out.lines = readLines();
      out.customerId = el("d_customerId").value;
      out.jobId = el("d_jobId").value;
      out.issued = el("d_issued").value;
      out.due = el("d_due").value;
      out.number = Math.round(nval("d_number"));
      out.taxOn = el("d_taxOn").checked;
      out.taxRate = nval("d_taxRate");
      out.paidDate = el("d_paidDate").value;
      out.method = el("d_method").value;
      out.notes = el("d_notes").value;
      out.prefix = BIZ.prefix || "SS";
      return out;
    }
    // Where the next number comes from, in order of trustworthiness:
    //  1. the database sequence, which cannot hand two tabs the same number;
    //  2. one past the highest number already on the books.
    // The second is for the version of this that runs without a database. It
    // is not race-free across two open tabs, so it is the fallback and not the
    // design. What it is NOT is a counter stored in the settings document:
    // that could silently drift out of step with the real numbers in use.
    function allocNumber(){
      if (INVOICE_RPC && INVOICE_RPC.nextNumber) {
        return INVOICE_RPC.nextNumber();
      }
      var top = 1000;
      S.invoices.forEach(function(i){
        var n = Number(i.number) || 0;
        if (n > top) top = n;
      });
      return Promise.resolve(top + 1);
    }

    // An invoice goes to a paying customer, so it may not be saved half-formed.
    function invoiceProblems(out){
      var bad = [];
      var typed = el("d_newCust") ? el("d_newCust").value.trim() : "";
      if (!out.customerId && !typed) bad.push("a customer");
      if (!out.issued) bad.push("an issue date");
      if (!(out.lines || []).some(function(l){
        return (Number(l.qty) || 0) * (Number(l.rate) || 0) !== 0;
      })) bad.push("at least one line with a quantity and a rate");
      return bad;
    }

    function commit(){
      var out = gather();
      var bad = invoiceProblems(out);
      if (bad.length) {
        return Promise.reject(new Error("This invoice still needs " + bad.join(", ") + "."));
      }
      var typed = el("d_newCust") ? el("d_newCust").value : "";
      return resolveCustomer(out.customerId, typed).then(function(cid){
        out.customerId = cid;
        if (inv) out.id = inv.id;

        // One call, one transaction: the number is issued, the invoice is
        // written and the job is marked, or none of it happens. Writing the
        // invoice and then the job separately left an invoice with the job
        // still on the invoice-it list, billable a second time.
        if (INVOICE_RPC && INVOICE_RPC.commit) {
          return INVOICE_RPC.commit(out, isNew).then(function(saved){
            out.id = saved.id; out.number = saved.number;
            localJobStatus(out);
            return out;
          });
        }

        // No transactional path. Get a number some other way, but never store
        // a blank one: a numberless invoice is worse than a refused save.
        var num = isNew ? allocNumber().then(function(n){ out.number = n; })
                        : Promise.resolve();
        return num.then(function(){
          if (isNew && !(Number(out.number) > 0)) {
            throw new Error("Could not get an invoice number. Nothing was saved " +
                            "— check your connection and try again.");
          }
          return put("invoices", out).then(function(id){
            out.id = id;
            // no transaction available here, so this really is a second write.
            // Await it, so a failure surfaces instead of leaving the job on the
            // invoice-it list where it could be billed again.
            return markJobBilled(out).then(function(){ return out; });
          });
        });
      });
    }

    // the server already did this inside the transaction; just catch the view up
    function localJobStatus(out){
      if (!out.jobId) return;
      var j = byId(S.jobs, out.jobId);
      if (j && j.status !== "paid") {
        j.status = out.paidDate ? "paid" : "invoiced";
        renderAll();
      }
    }
    // the fallback path has to write it itself
    function markJobBilled(out){
      if (!out.jobId) return Promise.resolve();
      var j = byId(S.jobs, out.jobId);
      if (!j || j.status === "paid") return Promise.resolve();
      return put("jobs", Object.assign({}, j,
        {status: out.paidDate ? "paid" : "invoiced"}));
    }

    var save = document.createElement("button");
    save.type = "button"; save.className = "act"; save.textContent = "Save";
    var ierr = document.createElement("div");
    ierr.className = "flag red"; ierr.hidden = true;
    ierr.setAttribute("role", "alert");
    save.addEventListener("click", function(){
      ierr.hidden = true;
      save.disabled = true; save.textContent = "Saving…";
      commit().then(closeDrawer, function(err){
        save.disabled = false; save.textContent = "Save";
        ierr.textContent = (err && err.message) || "Could not save the invoice.";
        ierr.hidden = false;
      });
    });
    body.appendChild(ierr);
    foot.appendChild(save);

    var spdf = document.createElement("button");
    spdf.type = "button"; spdf.className = "act ghost"; spdf.textContent = "Save and make PDF";
    spdf.addEventListener("click", function(){
      ierr.hidden = true;
      spdf.disabled = true;
      var was = spdf.textContent;
      spdf.textContent = "Saving\u2026";
      commit().then(function(out){
        makeInvoicePdf(out);
        closeDrawer();
      }, function(err){
        // used to have no rejection path, so a failure here silently produced
        // neither an invoice nor a PDF
        spdf.disabled = false; spdf.textContent = was;
        ierr.textContent = (err && err.message) || "Could not save the invoice.";
        ierr.hidden = false;
      });
    });
    foot.appendChild(spdf);

    if (inv && inv.id) {
      // the shared control: two taps, says it is permanent, reports a failure
      // instead of closing the drawer as though the invoice had gone
      foot.appendChild(deleteButton(
        function(){ return drop("invoices", inv.id); },
        "Invoice " + invNo(inv) + " will be gone, and its number is not reissued."));
    }
    body.appendChild(foot);

    el("d_taxOn").addEventListener("change", totals);
    el("d_taxRate").addEventListener("input", totals);
    totals();
    el("scrim").hidden = false;
  }
  el("newInv").addEventListener("click", function(){ editInvoice(null); });

  // build an invoice straight off a finished job
  function invoiceFromJob(j){
    var inv = blankInvoice();
    inv.customerId = j.customerId;
    inv.jobId = j.id;
    inv.lines = [{desc: j.title || "Land clearing", qty:1, rate: Number(j.price) || 0}];
    editInvoice(inv);
  }

  /* ---------- invoice PDF ---------- */
  function makeInvoicePdf(inv){
    var JS = window.jspdf && window.jspdf.jsPDF;
    if (!JS) { alert("PDF library did not load — check the connection."); return; }
    var doc = new JS({unit:"pt", format:"letter"});
    var L = 56, W = 612, BOT = 744;
    var AC = hexRgb(CFG.brand.accent);
    var t = invTotal(inv);
    var cust = byId(S.customers, inv.customerId);
    var job = inv.jobId ? byId(S.jobs, inv.jobId) : null;
    var y = 64;

    // header
    doc.setFont("helvetica","bold"); doc.setFontSize(21); doc.setTextColor(30);
    doc.text(String(BIZ.dba || BIZ.legal || "SWANSTON SERVICES"), L, y);
    doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(120);
    var hl = [BIZ.legal, BIZ.addr, [BIZ.phone, BIZ.email].filter(Boolean).join("   ·   "),
              BIZ.ein ? "EIN " + BIZ.ein : ""].filter(Boolean);
    hl.forEach(function(line){ y += 13; doc.text(String(line), L, y); });

    // invoice block, right
    doc.setFont("helvetica","bold"); doc.setFontSize(24); doc.setTextColor(AC[0],AC[1],AC[2]);
    doc.text("INVOICE", W - L, 64, {align:"right"});
    doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(90);
    doc.text(invNo(inv), W - L, 82, {align:"right"});
    doc.setFontSize(9.5); doc.setTextColor(120);
    doc.text("Issued  " + nice(inv.issued), W - L, 97, {align:"right"});
    doc.text("Due  " + nice(inv.due), W - L, 110, {align:"right"});

    y = Math.max(y, 118) + 16;
    doc.setDrawColor(AC[0],AC[1],AC[2]); doc.setLineWidth(2);
    doc.line(L, y, W - L, y);

    // bill to
    y += 26;
    doc.setFont("helvetica","bold"); doc.setFontSize(9.5); doc.setTextColor(120);
    doc.text("BILL TO", L, y);
    doc.setFont("helvetica","normal"); doc.setFontSize(11.5); doc.setTextColor(30);
    y += 16; doc.text(cust ? String(cust.name || "") : "—", L, y);
    [cust && cust.addr, cust && cust.phone, cust && cust.email].filter(Boolean)
      .forEach(function(line){
        y += 13; doc.setFontSize(10); doc.setTextColor(110); doc.text(String(line), L, y);
      });
    if (job && job.addr) {
      y += 15; doc.setFontSize(9.5); doc.setTextColor(120);
      doc.text("Work performed at  " + job.addr, L, y);
    }

    // line table
    y += 30;
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(120);
    doc.text("DESCRIPTION", L, y);
    doc.text("QTY", W - L - 186, y, {align:"right"});
    doc.text("RATE", W - L - 96, y, {align:"right"});
    doc.text("AMOUNT", W - L, y, {align:"right"});
    y += 7;
    doc.setDrawColor(200); doc.setLineWidth(0.8); doc.line(L, y, W - L, y);

    (inv.lines || []).forEach(function(l){
      var amt = (Number(l.qty)||0) * (Number(l.rate)||0);
      var wrapped = doc.splitTextToSize(String(l.desc || ""), W - 2*L - 210);
      if (y + 14 + wrapped.length * 12 > BOT) { doc.addPage(); y = 64; }
      y += 19;
      doc.setFont("helvetica","normal"); doc.setFontSize(11); doc.setTextColor(35);
      doc.text(wrapped[0] || "", L, y);
      doc.text(String(Number(l.qty) || 0), W - L - 186, y, {align:"right"});
      doc.text(usd(l.rate), W - L - 96, y, {align:"right"});
      doc.text(usd(amt), W - L, y, {align:"right"});
      for (var k = 1; k < wrapped.length; k++) {
        y += 12; doc.setFontSize(10); doc.setTextColor(110);
        doc.text(wrapped[k], L, y);
      }
      y += 8;
      doc.setDrawColor(230); doc.setLineWidth(0.5); doc.line(L, y, W - L, y);
    });

    // totals
    if (y + 110 > BOT) { doc.addPage(); y = 64; }
    y += 24;
    var tx = W - L - 150;
    function totRow(label, val, bold, big){
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(big ? 13 : 10.5);
      doc.setTextColor(bold ? 30 : 110);
      doc.text(label, tx, y, {align:"right"});
      doc.setTextColor(bold ? 30 : 60);
      doc.text(val, W - L, y, {align:"right"});
      y += big ? 20 : 16;
    }
    totRow("Subtotal", usd(t.sub));
    if (inv.taxOn) totRow("Texas sales tax " + (Number(inv.taxRate)||0) + "%", usd(t.tax));
    y += 2;
    doc.setDrawColor(200); doc.setLineWidth(0.8);
    doc.line(tx - 60, y - 8, W - L, y - 8);
    y += 6;
    totRow(inv.paidDate ? "Total" : "Total due", usd(t.total), true, true);
    if (inv.paidDate) {
      doc.setFont("helvetica","bold"); doc.setFontSize(11);
      doc.setTextColor(51,105,63);
      doc.text("PAID  " + nice(inv.paidDate) + (inv.method ? "  ·  " + inv.method : ""),
               W - L, y, {align:"right"});
      y += 20;
    }

    // how to pay
    if (!inv.paidDate) {
      if (y + 88 > BOT) { doc.addPage(); y = 64; }
      y += 14;
      doc.setFillColor(237,239,233);
      var boxH = BIZ.payLink ? 78 : 58;
      doc.rect(L, y, W - 2*L, boxH, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(40);
      doc.text("HOW TO PAY", L + 14, y + 20);
      doc.setFont("helvetica","normal"); doc.setFontSize(10.5); doc.setTextColor(70);
      var py = y + 37;
      if (BIZ.payLink) {
        doc.setTextColor(AC[0],AC[1],AC[2]);
        doc.textWithLink("Pay online by card or bank transfer", L + 14, py, {url:BIZ.payLink});
        doc.setFontSize(9); doc.setTextColor(130);
        py += 13; doc.text(String(BIZ.payLink), L + 14, py);
        py += 15; doc.setFontSize(10.5); doc.setTextColor(70);
      }
      if (BIZ.payNote) doc.text(String(BIZ.payNote), L + 14, py);
      y += boxH + 10;
    }

    // footer
    if (y + 40 > BOT) { doc.addPage(); y = 64; }
    y += 14;
    doc.setFontSize(9); doc.setTextColor(130);
    var tail = [inv.notes, BIZ.invTerms].filter(Boolean).join("  ");
    if (tail) {
      doc.splitTextToSize(tail, W - 2*L).forEach(function(ln, n){
        doc.text(ln, L, y + n * 11);
      });
    }

    var nm = (cust && cust.name ? cust.name : "customer").replace(/[^A-Za-z0-9 _-]/g, "").slice(0,40);
    saveBlob(doc.output("blob"), "Invoice " + invNo(inv) + " - " + nm + ".pdf");
  }

  /* ==================================================================
     QUOTE  ->  JOB
     ================================================================== */
  function keepQuoteAsJob(){
    var results = CFG.depths.map(compute);
    var c = results[selected];
    if (!c.ready) { el("keepStatus").textContent = "Fill in " + c.missing.join(", ") + " first."; return; }
    var price = Math.round(finalPrice(c));
    var nm = (el("custName").value || "").trim();
    var addr = (el("custAddr").value || "").trim();
    if (!nm) { el("keepStatus").textContent = "Put a customer name on it first."; return; }

    el("keepStatus").textContent = "Saving…";
    var existing = null;
    S.customers.forEach(function(x){
      if (String(x.name||"").toLowerCase() === nm.toLowerCase()) existing = x;
    });
    var dw = densByKey(el("dens").value);
    var title = Math.round(c.len) + " ft × " + c.depth + " ft · " + ((dw && dw.words) || "brush");

    var lastCustId = null;
    Promise.resolve(existing ? existing.id : put("customers", {name:nm, addr:addr, created:today()}))
      .then(function(cid){
        lastCustId = cid;
        return put("jobs", {
          customerId: cid, date: today(), status:"scheduled",
          title: title, addr: addr, price: price,
          dumpCost: Math.round(c.dumpFee), materials: Math.round(c.equip + c.mob),
          loads: c.loads, quotedHours: Math.round(c.manHours * 10) / 10,
          depth: c.depth, lenFt: Math.round(c.len),
          notes: "From the quote builder. " + c.manHours.toFixed(1) + " man-hours estimated, " +
                 c.loads + " loads, dump " + usd0(c.dumpFee) + "."
        });
      })
      .then(function(jobId){
        // the crew can only pick jobs that exist in the slim mirror
        return mirrorJob(jobId, {date: today(), customerId: lastCustId, title: title})
          .then(function(){ return jobId; });
      })
      .then(function(){
        el("keepStatus").textContent = "Saved to Jobs.";
        setTimeout(function(){ el("keepStatus").textContent = ""; }, 3500);
      })
      .catch(function(){ el("keepStatus").textContent = "Could not save it."; });
  }

  /* ==================================================================
     ROLES — one artifact, two faces
     ================================================================== */
  var ME = {id:null, admin:false, name:"", crewId:null, resolved:false};
  var PREVIEW = false;   // owner looking at the crew view on purpose

  function isAdminView(){ return ME.admin && !PREVIEW; }

  function applyRole(){
    var crew = !isAdminView();
    document.querySelector(".navwrap").hidden = crew;
    el("crewNav").hidden = !crew;
    document.querySelectorAll("[data-page]").forEach(function(p){
      if (crew) p.hidden = true;
    });
    document.querySelectorAll("[data-cpage]").forEach(function(p){
      if (!crew) p.hidden = true;
    });
    var ib = document.querySelector('.nav button[data-tab="inbox"]');
    if (ib) ib.hidden = !ME.admin;
    if (crew) { showCrew(crewTab); renderCrew2(); wireJobsTab(); fillCjJob(); }
    else {
      var t = null;
      try { t = localStorage.getItem("sw_ops_tab"); } catch (e) {}
      var ok = ["today","quote","jobs","invoices","expenses","crew","books","inbox","setup"];
      show(ok.indexOf(t) >= 0 ? t : "today");
      renderAll();
    }
  }

  /* ---------- crew router ---------- */
  var crewTab = "chours";
  function showCrew(tab){
    crewTab = tab;
    document.querySelectorAll("#crewNav button").forEach(function(b){
      b.setAttribute("aria-selected", b.getAttribute("data-ctab") === tab ? "true" : "false");
    });
    document.querySelectorAll("[data-cpage]").forEach(function(p){
      p.hidden = p.getAttribute("data-cpage") !== tab;
    });
    window.scrollTo(0,0);
  }
  document.querySelectorAll("#crewNav button").forEach(function(b){
    b.addEventListener("click", function(){ showCrew(b.getAttribute("data-ctab")); });
  });

  /* ---------- the shared, crew-readable slices ---------- */
  var JOBLIST = [];   // {id, date, who, title} — no money in it
  var FORMS   = [];
  var PHOTOS  = [];
  var PHOTOBOX = null;
  var JOBS_RPC = null;
  var INVOICE_RPC = null;
  var INBOX   = [];

  function safeInboxReceipt(s){
    var u = safeUrl(s.receiptUrl);
    if (u) return u;
    var d = String(s.receiptData || "");
    return /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/i.test(d) ? d : "";
  }

  // mirror a job into the slim list the crew may read
  function mirrorJob(id, j){
    if (!DB) return Promise.resolve();
    return DB.collection("joblist").doc(id).set({
      date: j.date || "", who: custName(j.customerId), title: j.title || "",
      status: j.status || "scheduled", at: today()
    }).catch(function(){});
  }
  function unmirrorJob(id){
    if (!DB) return Promise.resolve();
    return DB.collection("joblist").doc(id).delete().catch(function(){});
  }

  // ============================================================
  //  PAPERWORK, one source of truth for both sides of the app.
  //  The owner's checklist on the Crew card and the crew member's own Forms
  //  tab both read this, so they can no longer disagree about what somebody
  //  is. `collect` marks the ones the owner keeps a copy of.
  //  Not tax advice: these are the standard federal forms for each
  //  relationship. Check anything unusual with a CPA.
  // ============================================================
  var PAPERWORK = {
    contractor: {
      label: "Independent contractor (1099)",
      youFile: "1099-NEC in January, if you paid them $600 or more for the year",
      forms: [
        {k:"w9", name:"Form W-9 \u2014 Taxpayer Identification", collect:true,
         who:"Before the first job",
         url:"https://www.irs.gov/pub/irs-pdf/fw9.pdf",
         note:"This is how you get paid. It gives Jack your legal name, address and tax ID so he can issue your 1099-NEC in January. Without it he has to hold back 24% of every payment as backup withholding."},
        {k:"coi", name:"Certificate of insurance", collect:true,
         who:"Before the first job, and again at every renewal",
         url:"",
         note:"Ask your insurance agent to email a certificate directly to Jack, showing general liability and, if you carry it, workers compensation, with the business named as additional insured, under its exact legal name. It has to be current."},
        {k:"agreement", name:"Subcontractor agreement", collect:true,
         who:"Signed once",
         url:"",
         note:"Covers scope, price and who is responsible for what. Jack provides it. Each job then gets its own scope and price in writing before you start."},
        {k:"rental", name:"Equipment rental agreement", collect:true,
         who:"Only if you are paid separately for your truck, trailer or equipment",
         url:"",
         note:"Keeps equipment rent separate from payment for your work. Rent of $600 or more in a year is reported on a 1099-MISC rather than the 1099-NEC."},
        {k:"invoice", name:"How to invoice", collect:false,
         who:"After every job",
         url:"",
         note:"Send Jack the date, the property, what you did and the agreed price. A photo of a handwritten invoice is fine. Log your expenses in this app separately so they are not missed."}
      ]
    },
    employee: {
      label: "Employee (W-2)",
      youFile: "W-2 in January, plus payroll tax deposits and quarterly Form 941 all year",
      forms: [
        {k:"i9", name:"Form I-9 \u2014 Employment Eligibility", collect:true,
         who:"Within 3 business days of the first day of work",
         url:"https://www.uscis.gov/sites/default/files/document/forms/i-9.pdf",
         note:"You show Jack original documents proving who you are and that you may work in the US. He fills in section 2 and keeps the form. This one has a legal deadline, so do it on day one."},
        {k:"w4", name:"Form W-4 \u2014 Withholding Certificate", collect:true,
         who:"Before the first payday",
         url:"https://www.irs.gov/pub/irs-pdf/fw4.pdf",
         note:"Tells Jack how much federal income tax to hold back from your pay. Texas has no state income tax, so there is no state version to fill in."},
        {k:"newhire", name:"Texas new hire report", collect:false,
         who:"Jack files this within 20 days of your start date",
         url:"https://portal.cs.oag.state.tx.us/wps/portal/employer",
         note:"Nothing for you to do. Texas requires every employer to report a new hire to the Attorney General's office. Jack files it from your W-4 details."},
        {k:"comp", name:"Workers compensation confirmation", collect:true,
         who:"Before the first day",
         url:"",
         note:"Texas does not force most private employers to carry workers comp, but an employer without it gives up its usual legal protections, and a general liability policy will not pay for an employee's injury. Jack confirms which way he has gone before you start."},
        {k:"direct", name:"Direct deposit details", collect:false,
         who:"Before the first payday",
         url:"",
         note:"Give Jack a voided check or your bank's routing and account numbers. Hand them over in person rather than by text or email."}
      ]
    }
  };

  // The crew-readable record of who somebody is. Lives in `forms` because that
  // is already a collection a crew login may read; the doc id is keyed on the
  // crew record so a person can find their own.
  function mirrorWorker(id, c){
    if (!DB) return Promise.resolve();
    return DB.collection("forms").doc("person-" + id).set({
      kind: "person", crewId: id, name: c.name || "",
      type: c.type === "employee" ? "employee" : "contractor",
      at: today()
    }).catch(function(){});
  }
  function unmirrorWorker(id){
    if (!DB) return Promise.resolve();
    return DB.collection("forms").doc("person-" + id).delete().catch(function(){});
  }
  function myWorkerType(){
    for (var i = 0; i < FORMS.length; i++) {
      var f = FORMS[i];
      if (f.kind === "person" && ME.crewId && f.crewId === ME.crewId) return f.type;
    }
    return "contractor";
  }

  function paperworkFor(type){
    var pack = PAPERWORK[type === "employee" ? "employee" : "contractor"];
    // name the business by its exact legal name wherever Setup has one, rather
    // than hardcoding it in two places that can drift apart
    var legal = (BIZ && BIZ.legal) || "";
    if (!legal) return pack;
    return {
      label: pack.label, youFile: pack.youFile,
      forms: pack.forms.map(function(f){
        return Object.assign({}, f, {
          note: String(f.note || "").replace(/the business named as additional insured, under its exact legal name/,
                                             legal + " named as additional insured")
        });
      })
    };
  }

  // The crew-facing list, written into the shared `forms` collection so a crew
  // login can read it. Every person gets the list for THEIR type.
  function formDefaults(type){
    return paperworkFor(type).forms.map(function(f){
      return {k:f.k, name:f.name, who:f.who, url:f.url, note:f.note};
    });
  }

  /* ---------- crew: hours ---------- */
  function fillJobSelect(sel){
    var cur = sel.value;
    sel.innerHTML = "";
    var none = document.createElement("option");
    none.value = ""; none.textContent = "— not sure / other —";
    sel.appendChild(none);
    JOBLIST.slice().sort(function(a,b){
      return String(b.date||"").localeCompare(String(a.date||""));
    }).forEach(function(j){
      var o = document.createElement("option");
      o.value = j.id;
      o.textContent = shortDate(j.date) + " · " + (j.who || "") + " · " + (j.title || "job");
      sel.appendChild(o);
    });
    if (cur) sel.value = cur;
  }

  function mySubs(kind){
    return INBOX.filter(function(s){
      return s.by === ME.id && (!kind || s.kind === kind);
    }).sort(function(a,b){ return String(b.at||"").localeCompare(String(a.at||"")); });
  }

  function submit(kind, payload, statusEl, clear){
    if (!DB) { statusEl.textContent = "Not connected — try again in a moment."; return; }
    if (!ME.id) { statusEl.textContent = "Cannot tell who you are. Reload the page."; return; }
    statusEl.textContent = "Sending…";
    var id = ME.id.replace(/[^A-Za-z0-9_\-.~:@+]/g, "") + "-" + Date.now().toString(36);
    var body = Object.assign({
      kind:kind, by:ME.id, byName:ME.name || "", at:new Date().toISOString(),
      status:"pending"
    }, payload);
    DB.collection("inbox").doc(id).set(body).then(function(){
      statusEl.textContent = "Sent to Jack.";
      if (clear) clear();
      setTimeout(function(){ statusEl.textContent = ""; }, 3500);
    }).catch(function(){ statusEl.textContent = "Could not send that."; });
  }

  function wireCrew(){
    el("ch_date").value = today();
    el("ce_date").value = today();

    el("ch_send").addEventListener("click", function(){
      var h = parseFloat(el("ch_hours").value);
      if (!(h > 0)) { el("ch_status").textContent = "Put the hours in first."; return; }
      if (h > 16) { el("ch_status").textContent = "More than 16 hours in a day — check that."; return; }
      submit("hours", {
        date: el("ch_date").value || today(),
        hours: h,
        jobId: el("ch_job").value || "",
        jobName: el("ch_job").selectedOptions[0] ? el("ch_job").selectedOptions[0].textContent : "",
        note: el("ch_note").value || ""
      }, el("ch_status"), function(){
        el("ch_hours").value = ""; el("ch_note").value = "";
      });
    });

    // The crew are "can interact" viewers, so the asset store is closed to
    // them. Shrink the photo here and carry it inside the submission; the
    // owner's approval moves it into real storage.
    var pendingReceipt = {data:null};
    function shrink(file, done, fail){
      var fr = new FileReader();
      fr.onerror = fail;
      fr.onload = function(){
        var img = new Image();
        img.onerror = fail;
        img.onload = function(){
          var max = 1400;
          var sc = Math.min(1, max / Math.max(img.width, img.height));
          var cv = document.createElement("canvas");
          cv.width = Math.max(1, Math.round(img.width * sc));
          cv.height = Math.max(1, Math.round(img.height * sc));
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          var q = 0.72, out = cv.toDataURL("image/jpeg", q);
          while (out.length > 170000 && q > 0.3) { q -= 0.12; out = cv.toDataURL("image/jpeg", q); }
          if (out.length > 170000) { fail(); return; }
          done(out);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    }
    el("ce_file").addEventListener("change", function(){
      var f = el("ce_file").files && el("ce_file").files[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) {
        el("ce_fileHint").textContent = "Take a photo of it instead of attaching a file.";
        return;
      }
      el("ce_fileHint").textContent = "Attaching…";
      shrink(f, function(d){
        pendingReceipt.data = d;
        el("ce_fileHint").textContent = "Receipt attached.";
      }, function(){
        pendingReceipt.data = null;
        el("ce_fileHint").textContent = "That photo would not go through — try another.";
      });
    });

    el("ce_send").addEventListener("click", function(){
      var a = parseFloat(el("ce_amount").value);
      if (!(a > 0)) { el("ce_status").textContent = "Put the amount in first."; return; }
      if (!pendingReceipt.data) {
        el("ce_status").textContent = "Add a photo of the receipt first.";
        return;
      }
      submit("expense", {
        date: el("ce_date").value || today(),
        amount: a,
        vendor: el("ce_vendor").value || "",
        what: el("ce_what").value || "",
        jobId: el("ce_job").value || "",
        jobName: el("ce_job").selectedOptions[0] ? el("ce_job").selectedOptions[0].textContent : "",
        receiptData: pendingReceipt.data
      }, el("ce_status"), function(){
        el("ce_amount").value = ""; el("ce_vendor").value = ""; el("ce_what").value = "";
        el("ce_file").value = ""; pendingReceipt.data = null;
        el("ce_fileHint").textContent = "Required. Photograph the receipt before you leave.";
      });
    });
  }

  function renderCrew2(){
    fillJobSelect(el("ch_job"));
    fillJobSelect(el("ce_job"));
    el("cWho").textContent = ME.name ? ME.name : "";

    var hrs = mySubs("hours");
    var yr = String(new Date().getFullYear());
    var yrHours = hrs.filter(function(s){ return yearOf(s.date) === yr; })
      .reduce(function(t,s){ return t + (Number(s.hours)||0); }, 0);
    var okHours = hrs.filter(function(s){ return s.status === "approved" && yearOf(s.date) === yr; })
      .reduce(function(t,s){ return t + (Number(s.hours)||0); }, 0);
    var waiting = hrs.filter(function(s){ return s.status === "pending"; }).length;

    var tiles = [
      {k:"Hours sent " + yr, v:yrHours.toFixed(1)},
      {k:"Approved", v:okHours.toFixed(1)},
      {k:"Waiting", v:String(waiting), cls: waiting ? "hot" : ""}
    ];
    var host = el("cHrTiles"); host.innerHTML = "";
    tiles.forEach(function(t){
      var d = document.createElement("div");
      d.className = "tile" + (t.cls ? " " + t.cls : "");
      var k = document.createElement("div"); k.className = "k"; k.textContent = t.k;
      var v = document.createElement("div"); v.className = "v"; v.textContent = t.v;
      d.appendChild(k); d.appendChild(v); host.appendChild(d);
    });

    el("cHrCount").textContent = hrs.length + " submitted";
    var b = el("cHrRows"); b.innerHTML = "";
    if (!hrs.length) b.appendChild(emptyRow(5, "Nothing sent yet."));
    hrs.slice(0, 50).forEach(function(s){
      var tr = document.createElement("tr");
      cells(tr, [shortDate(s.date), s.jobName || "—", {n:(Number(s.hours)||0).toFixed(1)},
        {html:pill(s.status === "approved" ? "ok" : s.status === "rejected" ? "bad" : "warn", s.status)},
        s.note || ""]);
      b.appendChild(tr);
    });

    var ex = mySubs("expense");
    el("cExCount").textContent = ex.length + " submitted";
    var eb = el("cExRows"); eb.innerHTML = "";
    if (!ex.length) eb.appendChild(emptyRow(5, "Nothing sent yet."));
    ex.slice(0, 50).forEach(function(s){
      var tr = document.createElement("tr");
      cells(tr, [shortDate(s.date), s.vendor || "—", s.what || "—", {n:usd(s.amount)},
        {html:pill(s.status === "approved" ? "ok" : s.status === "rejected" ? "bad" : "warn", s.status)}]);
      eb.appendChild(tr);
    });

    var fl = el("cFormList"); fl.innerHTML = "";
    // Show the list for what THIS person is, not one list for everybody. The
    // owner's app mirrors each person's type into `forms` so a crew login can
    // find its own without being able to read the crew records themselves.
    var myType = myWorkerType();
    var pack = paperworkFor(myType);
    var head = document.createElement("div");
    head.className = "flag";
    head.innerHTML = "";
    var ht = document.createElement("b");
    ht.textContent = "You are set up as: " + pack.label + ". ";
    var hs = document.createElement("span");
    hs.textContent = myType === "employee"
      ? "Jack withholds tax from your pay and sends you a W-2 in January."
      : "Nothing is withheld from your pay. You handle your own taxes, and Jack " +
        "sends you a 1099-NEC in January if he paid you $600 or more for the year.";
    head.appendChild(ht); head.appendChild(hs);
    fl.appendChild(head);

    var mine = FORMS.filter(function(f){ return f.kind !== "person" && f.k; });
    // prefer the list stored for this person's type; fall back to the defaults
    var byKey = {};
    mine.forEach(function(f){ byKey[f.k] = f; });
    var list = pack.forms.map(function(def){ return byKey[def.k] || def; });
    list.forEach(function(f){
      var card = document.createElement("div");
      card.className = "tbl";
      var bar = document.createElement("div");
      bar.className = "bar";
      var n = document.createElement("span"); n.textContent = f.name;
      var w = document.createElement("span"); w.textContent = f.who || "";
      bar.appendChild(n); bar.appendChild(w);
      card.appendChild(bar);
      var body = document.createElement("div");
      body.style.padding = "14px";
      body.style.display = "grid"; body.style.gap = "10px";
      var note = document.createElement("p");
      note.style.fontSize = "14.5px"; note.style.margin = "0";
      note.textContent = f.note || "";
      body.appendChild(note);
      if (f.url) {
        var a = document.createElement("a");
        a.href = f.url; a.target = "_blank"; a.rel = "noopener";
        a.className = "act";
        a.style.display = "inline-block"; a.style.textDecoration = "none";
        a.style.width = "fit-content"; a.style.color = "#fff";
        a.textContent = "Open the form";
        body.appendChild(a);
      }
      card.appendChild(body);
      fl.appendChild(card);
    });
  }


  /* ---------- crew: the jobs tab ---------- */
  var cjJob = "";

  function fillCjJob(){
    var sel = el("cj_job");
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = "";
    var none = document.createElement("option");
    none.value = ""; none.textContent = "\u2014 pick a job \u2014";
    sel.appendChild(none);
    JOBLIST.slice().sort(function(a,b){
      return String(b.date||"").localeCompare(String(a.date||""));
    }).forEach(function(j){
      var o = document.createElement("option");
      o.value = j.id;
      o.textContent = shortDate(j.date) + " \u00b7 " + (j.who||"") + " \u00b7 " + (j.title||"job");
      sel.appendChild(o);
    });
    if (cur) sel.value = cur;
    cjJob = sel.value;
    paintStatus();
    paintThumbs();
  }

  function paintStatus(){
    var j = cjJob ? null : null;
    JOBLIST.forEach(function(x){ if (x.id === cjJob) j = x; });
    var cur = j && j.status ? j.status : "";
    document.querySelectorAll("#cj_status button").forEach(function(b){
      b.setAttribute("aria-pressed", b.getAttribute("data-st") === cur ? "true" : "false");
      b.disabled = !cjJob;
    });
  }

  function myPhotos(){
    return PHOTOS.filter(function(p){ return p.jobId === cjJob; })
      .sort(function(a,b){ return String(a.at||"").localeCompare(String(b.at||"")); });
  }
  function paintThumbs(){
    var host = el("cj_thumbs");
    if (!host) return;
    host.innerHTML = "";
    myPhotos().forEach(function(p){
      var w = document.createElement("div");
      w.className = "thumb";
      var img = document.createElement("img");
      img.alt = p.kind || ""; img.src = p.url;
      var tag = document.createElement("span");
      tag.textContent = (p.kind || "").toUpperCase();
      tag.style.cssText = "position:absolute;left:0;bottom:0;background:var(--ink);" +
        "color:var(--paper);font-family:var(--mono);font-size:8px;letter-spacing:.1em;padding:2px 4px;";
      w.appendChild(img); w.appendChild(tag);
      host.appendChild(w);
    });
  }

  function shrinkPhoto(file, done, fail){
    var fr = new FileReader();
    fr.onerror = fail;
    fr.onload = function(){
      var img = new Image();
      img.onerror = fail;
      img.onload = function(){
        var max = 1800;
        var sc = Math.min(1, max / Math.max(img.width, img.height));
        var cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(img.width * sc));
        cv.height = Math.max(1, Math.round(img.height * sc));
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(function(b){ b ? done(b) : fail(); }, "image/jpeg", 0.86);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  function sendPhoto(kind, file){
    var st = el("cj_phStatus");
    if (!cjJob) { st.textContent = "Pick a job first."; return; }
    if (!PHOTOBOX) { st.textContent = "Photo upload is not available in this view."; return; }
    st.textContent = "Uploading the " + kind + " photo\u2026";
    shrinkPhoto(file, function(blob){
      PHOTOBOX.upload(blob, cjJob, kind).then(function(r){
        if (!DB) throw new Error("offline");
        return DB.collection("jobphotos").doc().set({
          jobId: cjJob, kind: kind, url: r.url, path: r.id,
          at: new Date().toISOString(), byName: ME.name || ""
        });
      }).then(function(){
        st.textContent = kind.charAt(0).toUpperCase() + kind.slice(1) + " photo sent.";
        setTimeout(function(){ st.textContent = ""; }, 3000);
      }).catch(function(){ st.textContent = "That photo would not upload."; });
    }, function(){ st.textContent = "Could not read that photo."; });
  }

  var jobsWired = false;
  function wireJobsTab(){
    if (jobsWired || !el("cj_job")) return;
    jobsWired = true;

    el("cj_job").addEventListener("change", function(){
      cjJob = el("cj_job").value;
      paintStatus(); paintThumbs();
      el("cj_stStatus").textContent = "";
    });

    document.querySelectorAll("#cj_status button").forEach(function(b){
      b.addEventListener("click", function(){
        if (!cjJob) { el("cj_stStatus").textContent = "Pick a job first."; return; }
        var st = b.getAttribute("data-st");
        el("cj_stStatus").textContent = "Saving\u2026";
        JOBS_RPC.setStatus(cjJob, st).then(function(){
          JOBLIST.forEach(function(x){ if (x.id === cjJob) x.status = st; });
          paintStatus();
          el("cj_stStatus").textContent = "Jack can see it.";
          setTimeout(function(){ el("cj_stStatus").textContent = ""; }, 3000);
        }).catch(function(e){
          el("cj_stStatus").textContent = (e && e.message) || "Could not save that.";
        });
      });
    });

    [["cj_before","before"],["cj_after","after"]].forEach(function(pair){
      var inp = el(pair[0]);
      if (!inp) return;
      inp.addEventListener("change", function(){
        var f = inp.files && inp.files[0];
        if (f) sendPhoto(pair[1], f);
        inp.value = "";
      });
    });

    fillCjJob();
  }

  /* ---------- owner: inbox ---------- */
  function renderInbox(){
    var pend = INBOX.filter(function(s){ return s.status === "pending"; })
      .sort(function(a,b){ return String(a.at||"").localeCompare(String(b.at||"")); });
    var done = INBOX.filter(function(s){ return s.status !== "pending"; })
      .sort(function(a,b){ return String(b.at||"").localeCompare(String(a.at||"")); }).slice(0, 40);

    el("inboxCount").textContent = pend.length ? pend.length + " waiting" : "";
    var navBtn = document.querySelector('.nav button[data-tab="inbox"]');
    if (navBtn) navBtn.textContent = pend.length ? "Inbox (" + pend.length + ")" : "Inbox";

    var b = el("inboxRows"); b.innerHTML = "";
    if (!pend.length) b.appendChild(emptyRow(7, "Nothing waiting."));
    pend.forEach(function(s){
      var tr = document.createElement("tr");
      var what = s.kind === "hours"
        ? (Number(s.hours)||0).toFixed(1) + " hours on " + shortDate(s.date) +
          (s.note ? " — " + s.note : "")
        : (s.what || "expense") + " at " + (s.vendor || "—") + " on " + shortDate(s.date);
      cells(tr, [
        shortDate(String(s.at||"").slice(0,10)), s.byName || "crew", what,
        s.jobName || "—",
        {n: s.kind === "expense" ? usd(s.amount) : ""},
        // The URL on an inbox row is written BY THE CREW, so it is the one
        // place in the app where it is genuinely attacker-controlled — and it
        // was the one place that skipped safeUrl. A data: receipt preview is
        // still allowed, since the crew page makes those itself from the file
        // the user picked, but only if it really is an image.
        {html: safeInboxReceipt(s)
          ? '<a href="' + esc(safeInboxReceipt(s)) + '" target="_blank" rel="noopener">view</a>'
          : "—"}
      ]);
      var act = document.createElement("td");
      var ok = document.createElement("button");
      ok.type = "button"; ok.className = "act";
      ok.style.padding = "4px 10px"; ok.style.fontSize = "12px";
      ok.textContent = "Approve";
      ok.addEventListener("click", function(){ approve(s); });
      var no = document.createElement("button");
      no.type = "button"; no.className = "act ghost";
      no.style.padding = "4px 10px"; no.style.fontSize = "12px"; no.style.marginLeft = "6px";
      no.textContent = "Reject";
      no.addEventListener("click", function(){ setSubStatus(s, "rejected"); });
      act.appendChild(ok); act.appendChild(no);
      tr.appendChild(act);
      b.appendChild(tr);
    });

    var db2 = el("doneRows"); db2.innerHTML = "";
    if (!done.length) db2.appendChild(emptyRow(5, "Nothing handled yet."));
    done.forEach(function(s){
      var tr = document.createElement("tr");
      cells(tr, [
        shortDate(String(s.at||"").slice(0,10)), s.byName || "crew",
        s.kind === "hours" ? (Number(s.hours)||0).toFixed(1) + " hours" : (s.what || "expense"),
        {n: s.kind === "expense" ? usd(s.amount) : ""},
        {html:pill(s.status === "approved" ? "ok" : "bad", s.status)}
      ]);
      db2.appendChild(tr);
    });
  }

  function setSubStatus(s, status, extra){
    if (!DB) return Promise.resolve();
    return DB.collection("inbox").doc(s.id)
      .set(Object.assign({}, s, {status:status, handledAt:today()}, extra || {}))
      .catch(function(){});
  }

  // approving writes the real record, then marks the submission
  function approve(s){
    if (s.kind === "hours") {
      var person = null;
      S.crew.forEach(function(c){ if (c.viewerId === s.by) person = c; });
      if (!person) {
        linkPerson(s, function(c){ approveHours(s, c); });
        return;
      }
      approveHours(s, person);
      return;
    }
    var owedTo = null;
    S.crew.forEach(function(c){ if (c.viewerId === s.by) owedTo = c.id; });
    stowReceipt(s).then(function(r){
      return put("expenses", {
        date: s.date, vendor: s.vendor || "", cat: guessCat(s),
        amount: Number(s.amount) || 0, jobId: s.jobId || "",
        notes: (s.what || "") + (s.byName ? "  (submitted by " + s.byName + ")" : ""),
        receiptUrl: r.url, receiptId: r.id,
        paidBy: owedTo,            // out of their pocket, so it is owed back
        reimbursedDate: ""
      });
    }).then(function(){
      // drop the inline copy once it is safely in the store
      setSubStatus(s, "approved", {receiptData: null});
    });
  }
  function approveHours(s, person){
    put("hours", {
      date: s.date, crewId: person.id, jobId: s.jobId || "",
      hours: Number(s.hours) || 0,
      // stamp the rate and the worker type ONTO the shift. A shift that leans
      // on the crew record for its rate is worth nothing the moment that
      // record is deleted, which silently wiped money the owner still owed.
      rate: Number(person.rate) || 0,
      workerType: workerType(person),
      who: person.name || "",
      note: s.note || ""
    }).then(function(){ setSubStatus(s, "approved"); });
  }
  // carried photo -> asset store, as the owner (who may write assets)
  function stowReceipt(s){
    if (s.receiptUrl) return Promise.resolve({url:s.receiptUrl, id:s.receiptId || null});
    if (!s.receiptData) return Promise.resolve({url:null, id:null});
    if (!ASSETS) return Promise.resolve({url:s.receiptData, id:null});
    try {
      var parts = String(s.receiptData).split(",");
      var mime = (/data:([^;]+)/.exec(parts[0]) || [])[1] || "image/jpeg";
      var bin = atob(parts[1]);
      var buf = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      var blob = new Blob([buf], {type:mime});
      return ASSETS.upload(blob).then(function(r){ return {url:r.url, id:r.id}; })
        .catch(function(){ return {url:s.receiptData, id:null}; });
    } catch (e) { return Promise.resolve({url:s.receiptData, id:null}); }
  }

  function guessCat(s){
    var t = ((s.vendor || "") + " " + (s.what || "")).toLowerCase();
    if (/dump|recycl|landfill|disposal/.test(t)) return "dump";
    if (/fuel|gas|diesel|shell|exxon|chevron/.test(t)) return "fuel";
    if (/chain|blade|bar oil|wedge|file/.test(t)) return "consum";
    return "other";
  }

  // first time someone submits, say who they are
  function linkPerson(s, then){
    if (!S.crew.length) {
      alert("Add " + (s.byName || "this person") + " under Crew first, then approve this.");
      return;
    }
    openForm("Who sent this?", [
      {k:"crewId", label:"This is", type:"select", opts:crewOpts(), wide:true,
       hint:"Linked once, then their submissions post automatically"}
    ], {crewId:S.crew[0].id}, function(v){
      var c = byId(S.crew, v.crewId);
      if (!c) return;
      return put("crew", Object.assign({}, c, {viewerId:s.by})).then(function(){
        then(Object.assign({}, c, {viewerId:s.by}));
      });
    });
  }


  /* ================= boot ================= */
  window.__swanstonStart = function(){
    el("keepJob").addEventListener("click", keepQuoteAsJob);
    wireCrew();
    bizToForm();
    show("today");
    bootOps();
  };

})();
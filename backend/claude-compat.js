/* ============================================================
   claude-compat.js

   The ops app was written against the Claude artifact runtime,
   which hands a page `window.claude.use(name)` for its database,
   file storage, identity and model access.

   This file reimplements that exact surface on top of Supabase,
   so the 50KB of app logic ports without touching a single call
   site. If you ever move hosts again, replace this file and
   nothing else.
   ============================================================ */
(function () {
  "use strict";

  var SB = null;          // supabase client, set by boot()
  var PROFILE = null;     // { id, role, full_name, crew_id }
  var AI_ENDPOINT = "/api/read-job";

  // ---------- paths ----------
  // "settings/business"            -> { c:"settings", d:"business" }
  // collection("jobs").doc("j1")   -> { c:"jobs",     d:"j1" }
  // A PostgREST error carrying a JWT problem means the session is gone. The app
  // cannot tell that apart from "no rows" on its own, so it used to keep
  // rendering empty tables as though the data had been deleted. Report it once
  // and let the gate take over.
  function check(r) {
    if (r && r.error) {
      var m = String(r.error.message || "");
      var code = String(r.error.code || "");
      if (code === "PGRST301" || code === "401" || /jwt|token is expired|not authenticated/i.test(m)) {
        if (typeof window.__swanstonSessionLost === "function") {
          window.__swanstonSessionLost("signed out or the token expired");
        }
      }
      throw r.error;
    }
    return r;
  }

  function splitDoc(path) {
    var parts = String(path).split("/").filter(Boolean);
    if (parts.length % 2 !== 0) {
      throw new TypeError("document path needs an even number of segments: " + path);
    }
    // the app never nests deeper than one level; flatten anything that does
    return { c: parts.slice(0, -1).join("/"), d: parts[parts.length - 1] };
  }
  function newId(prefix) {
    return (prefix || "x") + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function snap(id, row) {
    return {
      id: id,
      exists: !!row,
      data: function () { return row ? row.data : undefined; },
      metadata: { fromCache: false, hasPendingWrites: false }
    };
  }

  // ---------- db ----------
  function docRef(c, d) {
    return {
      id: d,
      path: c + "/" + d,

      get: function () {
        return SB.from("docs").select("data")
          .eq("collection", c).eq("doc_id", d).maybeSingle()
          .then(function (r) {
            check(r);
            return snap(d, r.data);
          });
      },

      set: function (data) {
        return SB.from("docs")
          .upsert({ collection: c, doc_id: d, data: data },
                  { onConflict: "collection,doc_id" })
          .then(function (r) { check(r); });
      },

      update: function (patch) {
        return this.get().then(function (s) {
          if (!s.exists) { var e = new Error("no such document"); e.code = "invalid_argument"; throw e; }
          var merged = Object.assign({}, s.data(), patch);
          return docRef(c, d).set(merged);
        });
      },

      "delete": function () {
        return SB.from("docs").delete()
          .eq("collection", c).eq("doc_id", d)
          .then(function (r) { check(r); });
      },

      onSnapshot: function (next, err) {
        var dead = false;
        var self = this;
        function pull() {
          self.get().then(function (s) { if (!dead) next(s); })
                    .catch(function (e) { if (!dead && err) err(e); });
        }
        pull();
        var ch = SB.channel("doc:" + c + ":" + d)
          .on("postgres_changes",
              { event: "*", schema: "public", table: "docs", filter: "doc_id=eq." + d },
              pull)
          .subscribe();
        return function () { dead = true; try { SB.removeChannel(ch); } catch (e) {} };
      },

      collection: function (sub) { return collRef(c + "/" + d + "/" + sub); }
    };
  }

  function collRef(c) {
    var filters = [];
    var order = null;
    var cap = null;

    var api = {
      path: c,

      doc: function (id) { return docRef(c, id || newId(c.charAt(0))); },

      add: function (data) {
        var r = api.doc();
        return r.set(data).then(function () { return r; });
      },

      where: function (field, op, value) {
        filters.push([field, op, value]); return api;
      },
      orderBy: function (field, dir) { order = [field, dir || "asc"]; return api; },
      limit: function (n) { cap = n; return api; },

      get: function () { return run(); },

      onSnapshot: function (next, err) {
        var dead = false;
        function pull() {
          run().then(function (qs) { if (!dead) next(qs); })
               .catch(function (e) { if (!dead && err) err(e); });
        }
        pull();
        var ch = SB.channel("coll:" + c)
          .on("postgres_changes",
              { event: "*", schema: "public", table: "docs", filter: "collection=eq." + c },
              pull)
          .subscribe();
        return function () { dead = true; try { SB.removeChannel(ch); } catch (e) {} };
      }
    };

    function run() {
      var q = SB.from("docs").select("doc_id,data").eq("collection", c);
      filters.forEach(function (f) {
        var field = "data->>" + f[0];
        if (f[1] === "==" || f[1] === "eq") q = q.eq(field, f[2]);
        else if (f[1] === "!=") q = q.neq(field, f[2]);
        else if (f[1] === "<")  q = q.lt(field, f[2]);
        else if (f[1] === "<=") q = q.lte(field, f[2]);
        else if (f[1] === ">")  q = q.gt(field, f[2]);
        else if (f[1] === ">=") q = q.gte(field, f[2]);
        else if (f[1] === "in") q = q.in(field, f[2]);
      });
      if (order) q = q.order("data->>" + order[0], { ascending: order[1] === "asc" });
      if (cap)   q = q.limit(cap);
      return q.then(function (r) {
        check(r);
        var docs = (r.data || []).map(function (row) { return snap(row.doc_id, row); });
        return {
          docs: docs, size: docs.length, empty: !docs.length,
          docChanges: function () { return []; },
          metadata: { fromCache: false, hasPendingWrites: false }
        };
      });
    }

    return api;
  }

  var DB = {
    doc: function (path) { var p = splitDoc(path); return docRef(p.c, p.d); },
    collection: function (path) { return collRef(path); }
  };

  // ---------- assets (receipts) ----------
  // Private bucket. We hand back a signed URL so nothing is ever
  // world readable, and store the path so it can be re-signed later.
  var ASSETS = {
    upload: function (blob) {
      var uid = PROFILE && PROFILE.id;
      if (!uid) return Promise.reject(new Error("not signed in"));
      var ext = (blob.type && blob.type.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "");
      var path = uid + "/" + newId("r") + "." + ext;
      return SB.storage.from("receipts").upload(path, blob, {
        contentType: blob.type || "application/octet-stream", upsert: false
      }).then(function (r) {
        check(r);
        // Five minutes, not a year. A signed URL is a bearer token that
        // bypasses the access rules entirely: anything that copies it — a CSV
        // export, a screenshot, a forwarded email — hands over the receipt to
        // whoever holds it. The PATH is what gets stored; the link is minted
        // again whenever it is actually needed, so nothing expires for good.
        return SB.storage.from("receipts").createSignedUrl(path, 300);
      }).then(function (s) {
        if (s.error) throw s.error;
        return { id: path, url: s.data.signedUrl, contentType: blob.type };
      });
    },
    // mint a fresh link for a stored path. The app calls this at render time.
    resign: function (path, seconds) {
      return SB.storage.from("receipts")
        .createSignedUrl(path, seconds || 300)
        .then(function (s) { if (s.error) throw s.error; return s.data.signedUrl; });
    },
    list: function () {
      return SB.storage.from("receipts").list(PROFILE && PROFILE.id)
        .then(function (r) { return { assets: r.data || [], usage: null }; });
    }
  };

  // Owner-only bucket for I-9, W-4 and anything else carrying an SSN.
  // Links are deliberately short lived and every view is logged.
  var DOCS_BUCKET = {
    upload: function (blob, label) {
      if (!PROFILE || PROFILE.role !== "owner") {
        return Promise.reject(new Error("owner only"));
      }
      var ext = (blob.type && blob.type.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "");
      var path = "personnel/" + newId("d") + "." + ext;
      return SB.storage.from("documents").upload(path, blob, {
        contentType: blob.type || "application/octet-stream", upsert: false
      }).then(function (r) {
        check(r);
        return SB.rpc("log_event", {
          p_action: "document.upload", p_target: path,
          p_detail: { label: label || "" }
        }).then(function () { return { id: path }; });
      });
    },
    // 5 minute link, logged. Never store the result.
    open: function (path) {
      if (!PROFILE || PROFILE.role !== "owner") {
        return Promise.reject(new Error("owner only"));
      }
      return SB.rpc("log_event", { p_action: "document.view", p_target: path, p_detail: {} })
        .then(function () { return SB.storage.from("documents").createSignedUrl(path, 300); })
        .then(function (s) { if (s.error) throw s.error; return s.data.signedUrl; });
    }
  };

  // ---------- user ----------
  var USER = {
    isOwner: function () { return !!(PROFILE && PROFILE.role === "owner"); },
    canEdit: function () { return !!(PROFILE && PROFILE.role === "owner"); },
    // Returns the OWNER answer, not "is there a profile". The old version said
    // true for crew on every permission including data.write, so anything that
    // ever gated a write on this would have handed crew the owner's UI. The
    // database is the real boundary either way, but a capability that lies is
    // a trap for whoever writes the next feature.
    can: function (what) {
      var owner = !!(PROFILE && PROFILE.role === "owner");
      if (what === "data.read") return !!PROFILE;
      return owner;
    },
    id: function () { return Promise.resolve(PROFILE ? PROFILE.id : null); },
    me: function () {
      return Promise.resolve({
        id: PROFILE ? PROFILE.id : null,
        name: (PROFILE && PROFILE.full_name) || "",
        role: PROFILE ? PROFILE.role : null,
        // which crew record this login is, so the Forms tab can show them the
        // paperwork for what they actually are
        crewId: (PROFILE && PROFILE.crew_id) || null
      });
    },
    profiles: function (ids) {
      return SB.from("profiles").select("id,full_name").in("id", ids).then(function (r) {
        var out = {};
        (r.data || []).forEach(function (p) { out[p.id] = { name: p.full_name || "" }; });
        return out;
      });
    }
  };

  // ---------- downloads ----------
  var DOWNLOADS = {
    save: function (o) {
      return new Promise(function (resolve, reject) {
        try {
          var url = URL.createObjectURL(o.data);
          var a = document.createElement("a");
          a.href = url; a.download = o.filename;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          resolve();
        } catch (e) { reject(e); }
      });
    }
  };

  // ---------- sample (the AI job reader) ----------
  // The Anthropic key lives in the serverless function, never here.
  function blobToDataUrl(b) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result)); };
      fr.onerror = rej;
      fr.readAsDataURL(b);
    });
  }

  function callAI(input, opts) {
    opts = opts || {};
    var imgs = opts.images || [];
    // send the session token so the endpoint is not open to the whole internet
    return SB.auth.getSession().then(function (s) {
      var token = s && s.data && s.data.session && s.data.session.access_token;
      return Promise.all(imgs.map(blobToDataUrl)).then(function (dataUrls) {
        return fetch(AI_ENDPOINT, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "authorization": "Bearer " + (token || "")
          },
          body: JSON.stringify({ prompt: input, images: dataUrls }),
          signal: opts.signal
        });
      });
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          var e = new Error(t || ("http " + r.status));
          e.code = r.status === 429 ? "rate_limited"
                 : r.status === 403 ? "not_granted" : "unavailable";
          throw e;
        });
      }
      return r.json();
    });
  }

  var SAMPLE = function (input, opts) {
    return callAI(input, opts).then(function (j) {
      return { text: j.text || "", truncated: false };
    });
  };
  SAMPLE.json = function (input, opts) {
    return callAI(input, opts).then(function (j) {
      if (j.json) return j.json;
      try { return JSON.parse(j.text); }
      catch (e) { var er = new Error("model did not return JSON"); er.code = "bad_json"; throw er; }
    });
  };
  SAMPLE.limits = function () {
    return Promise.resolve({
      images: { maxCount: 4, mediaTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] }
    });
  };


  // ---------- job photos (crew upload, owner reads) ----------
  var PHOTOBOX = {
    upload: function (blob, jobId, kind) {
      var uid = PROFILE && PROFILE.id;
      if (!uid) return Promise.reject(new Error("not signed in"));
      var safe = String(jobId || "job").replace(/[^A-Za-z0-9_\-]/g, "");
      var path = uid + "/" + safe + "-" + (kind || "photo") + "-" + newId("") + ".jpg";
      return SB.storage.from("jobphotos").upload(path, blob, {
        contentType: "image/jpeg", upsert: false
      }).then(function (r) {
        check(r);
        // an hour, re-signed at render. Long enough that an <img> on an open
        // page keeps working; short enough that a copied link is not a
        // year-long key to the photo.
        return SB.storage.from("jobphotos").createSignedUrl(path, 3600);
      }).then(function (s) {
        if (s.error) throw s.error;
        return { id: path, url: s.data.signedUrl };
      });
    },
    resign: function (path, seconds) {
      return SB.storage.from("jobphotos")
        .createSignedUrl(path, seconds || 3600)
        .then(function (s) { if (s.error) throw s.error; return s.data.signedUrl; });
    }
  };

  // ---------- job status, through the guarded function ----------
  var INVOICE_RPC = {
    nextNumber: function () {
      return SB.rpc("next_invoice_number").then(function (r) {
        if (r.error) throw new Error(r.error.message || "could not get a number");
        return Number(r.data);
      });
    },
    setStart: function (n) {
      return SB.rpc("set_invoice_start", { p_next: n }).then(function (r) {
        if (r.error) throw new Error(r.error.message || "could not set it");
      });
    },
    // Issue the number, write the invoice and mark the job, in ONE Postgres
    // transaction. Doing it as separate round trips left an invoice saved with
    // the job still sitting on the invoice-it list, ready to be billed twice.
    commit: function (invoice, isNew) {
      var body = Object.assign({}, invoice);
      var id = body.id || newId("i");
      delete body.id;
      return SB.rpc("invoice_job", {
        p_invoice_id: id,
        p_data: body,
        p_job_id: body.jobId || null,
        p_assign_number: !!isNew
      }).then(function (r) {
        if (r.error) {
          throw new Error("Could not save the invoice — " +
            (r.error.message || "the database refused it") +
            ". Nothing was stored.");
        }
        var n = Number(r.data);
        if (isNew && !(n > 0)) {
          throw new Error("The database did not issue an invoice number. Nothing was saved.");
        }
        return { id: id, number: n > 0 ? n : Number(body.number) || 0 };
      });
    }
  };

  var JOBS_RPC = {
    setStatus: function (jobId, status) {
      return SB.rpc("report_job_status", { p_job_id: jobId, p_status: status })
        .then(function (r) {
          if (r.error) {
            var m = String(r.error.message || "");
            if (/crew may set/.test(m))   throw new Error("Jack sets that one.");
            if (/already billed/.test(m)) throw new Error("That job is already invoiced.");
            throw new Error("Could not save that.");
          }
        });
    }
  };

  // ---------- the surface the app asks for ----------
  var REGISTRY = {
    db: function () { return DB; },
    assets: function () { return ASSETS; },
    documents: function () { return DOCS_BUCKET; },   // extra, owner only
    photos: function () { return PHOTOBOX; },
    jobs: function () { return JOBS_RPC; },
    invoices: function () { return INVOICE_RPC; },
    user: function () { return USER; },
    downloads: function () { return DOWNLOADS; },
    sample: function () { return SAMPLE; }
  };

  window.claude = {
    use: function (name) {
      if (!SB || !PROFILE) return Promise.resolve(null);
      var f = REGISTRY[name];
      return Promise.resolve(f ? f() : null);
    }
  };

  // ---------- boot ----------
  // called by index.html once the user is signed in
  window.__swanstonBoot = function (client, profile) {
    SB = client;
    PROFILE = profile;
  };
  window.__swanstonProfile = function () { return PROFILE; };

  // owner-only people management, used by the Setup tab
  window.__swanstonPeople = function () {
    return SB.rpc("list_people").then(function (r) {
      check(r);
      return r.data || [];
    });
  };
  window.__swanstonSetRole = function (id, role) {
    return SB.rpc("set_person_role", { p_id: id, p_role: role }).then(function (r) {
      if (r.error) throw new Error(r.error.message || "could not change that");
    });
  };
})();

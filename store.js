/* גדוד 66 בזמ"א — שכבת נתונים
 * מצב הדגמה: localStorage + סנכרון בין לשוניות (BroadcastChannel).
 * מצב מבצעי: Firebase Firestore (ממלאים את firebase-config.js) — כל משתמש רואה עדכונים בזמן אמת.
 */
const Seed = (() => {
  const FIRST = ["אור","נועם","איתי","יונתן","עומר","דניאל","אלון","רועי","עידו","תומר","אריאל","יואב","מתן","אביב","גיא","נדב","עמית","שחר","ליאור","אוריה","יובל","הדר","שקד","מאיה","נועה","תמר","רוני","עדי","ליה","אגם","אלה","שירה","יהב","דור","בר","אסף","רז","טל","איתמר","אליה"];
  const LAST = ["כהן","לוי","מזרחי","פרץ","ביטון","אברהם","פרידמן","שפירא","דהן","אזולאי","גבאי","חדד","בן דוד","אוחיון","קליין","רוזן","שטרן","גולן","ברק","נחום","אשכנזי","סויסה","מלכה","עמר","יוסף","טל","שלום","זילבר","הלוי","בירנבאום"];
  let seed = 66;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const name = () => `${pick(FIRST)} ${pick(LAST)}`;
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const phone = () => `05${Math.floor(rnd() * 9)}-${pad(Math.floor(rnd() * 9999999), 7)}`;

  const SHIFT_COLORS = ["#39ff88", "#4cc9ff", "#ffb020", "#ff5ca8"];
  const TEAM_ROLES = ["מפקד צוות", "סגן מפקד צוות", "מפעיל 1", "מפעיל 2", "קשר", "נהג", "חובש"];

  function shiftBattery(id, letter, pnBase, empty) {
    const b = { id, name: `סוללה ${letter}`, letter, kind: "shift", shifts: {}, soldiers: {}, slots: {}, att: {}, locArrivals: {} };
    for (let s = 1; s <= 4; s++) b.shifts["s" + s] = { id: "s" + s, name: `משמרת ${s}`, color: SHIFT_COLORS[s - 1] };
    let n = 0;
    if (!empty) for (let s = 1; s <= 4; s++) for (let i = 0; i < 30; i++) {
      n++; const sid = `${id}${pad(n, 3)}`;
      b.soldiers[sid] = { id: sid, name: name(), pn: String(pnBase + n), phone: phone(), shift: "s" + s };
    }
    // שבצ"ק לדוגמה: 3 משמרות של 8 שעות ביום, סבב 1→4
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 3);
    let k = 0;
    for (let d = 0; d < (empty ? 0 : 21); d++) {
      const day = new Date(start); day.setDate(start.getDate() + d);
      [["06:00", "14:00"], ["14:00", "22:00"], ["22:00", "06:00"]].forEach(([st, en]) => {
        const slotId = `sl${id}${d}${st.slice(0, 2)}`;
        b.slots[slotId] = { id: slotId, shift: "s" + ((k % 4) + 1), date: ymd(day), start: st, end: en };
        k++;
      });
    }
    return b;
  }

  function locBattery(id, letter, pnBase, locNames, empty) {
    const b = { id, name: `סוללה ${letter}`, letter, kind: "loc", locations: {}, soldiers: {}, att: {}, locArrivals: {}, teams: {} };
    locNames.forEach((nm, i) => b.locations["l" + (i + 1)] = { id: "l" + (i + 1), name: nm });
    const locIds = Object.keys(b.locations);
    const now = Date.now();
    for (let n = 1; n <= (empty ? 0 : 72); n++) {
      const sid = `${id}${pad(n, 3)}`;
      b.soldiers[sid] = { id: sid, name: name(), pn: String(pnBase + n), phone: phone(), loc: n <= 66 ? locIds[(n - 1) % locIds.length] : null, locAt: now - 3600e3 * 6 };
    }
    const sids = Object.keys(b.soldiers);
    for (let t = 1; t <= 2; t++) {
      b.teams["t" + t] = { id: "t" + t, name: `צוות מיוחד ${t}`, roles: TEAM_ROLES.map((title, i) => ({ title, sid: (!empty && sids[(t - 1) * 7 + i + 50]) || null })) };
    }
    return b;
  }

  function build(empty = false) {
    seed = 66;
    const batteries = {
      a: shiftBattery("a", "א׳", 7100000, empty),
      b: locBattery("b", "ב׳", 7200000, ["אתר אלפא", "אתר בראבו", "אתר צ׳ארלי", "אתר דלתא", "אתר אקו", "אתר פוקסטרוט"], empty),
      g: locBattery("g", "ג׳", 7300000, ["נקודה 1", "נקודה 2", "נקודה 3", "נקודה 4", "נקודה 5"], empty),
      m: shiftBattery("m", "מ׳", 7400000, empty),
    };
    if (empty) return { v: 2, batteries, staff: {}, alerts: {}, acks: {} };
    // נוכחות לדוגמה במשמרת הנוכחית ובמיקומים
    const now = Date.now();
    ["a", "m"].forEach(bid => {
      const b = batteries[bid];
      const cur = Object.values(b.slots).find(s => Time.slotStart(s) <= now && Time.slotEnd(s) > now);
      if (!cur) return;
      Object.values(b.soldiers).filter(s => s.shift === cur.shift).forEach(s => { if (rnd() < 0.7) b.att[s.id] = { [cur.id]: now - Math.floor(rnd() * 3600e3) }; });
    });
    ["b", "g"].forEach(bid => {
      Object.values(batteries[bid].soldiers).forEach(s => { if (s.loc && rnd() < 0.6) batteries[bid].locArrivals[s.id] = { loc: s.loc, at: now - Math.floor(rnd() * 3600e3) }; });
    });
    const staff = {
      u1: { id: "u1", name: "סא״ל ליאור אבני", pn: "1000001", role: "mgd", battery: null },
      u2: { id: "u2", name: "רס״ן עידו כרמי", pn: "1000011", role: "cmd", battery: "a" },
      u3: { id: "u3", name: "סרן נועה שגיא", pn: "1000012", role: "dep", battery: "a" },
      u4: { id: "u4", name: "רס״ן תומר זיו", pn: "1000021", role: "cmd", battery: "b" },
      u5: { id: "u5", name: "סרן הדר רום", pn: "1000022", role: "dep", battery: "b" },
      u6: { id: "u6", name: "רס״ן אביב נגב", pn: "1000031", role: "cmd", battery: "g" },
      u7: { id: "u7", name: "סרן מאיה אלון", pn: "1000032", role: "dep", battery: "g" },
      u8: { id: "u8", name: "רס״ן יואב ענבר", pn: "1000041", role: "cmd", battery: "m" },
      u9: { id: "u9", name: "סרן שקד ארז", pn: "1000042", role: "dep", battery: "m" },
    };
    return { v: 2, batteries, staff, alerts: {}, acks: {} };
  }
  return { build, TEAM_ROLES, SHIFT_COLORS };
})();

const Time = {
  pad: n => String(n).padStart(2, "0"),
  ymd(d) { return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`; },
  slotStart(s) { return new Date(`${s.date}T${s.start}:00`).getTime(); },
  slotEnd(s) {
    let e = new Date(`${s.date}T${s.end}:00`).getTime();
    if (e <= this.slotStart(s)) e += 864e5;
    return e;
  },
  hm(ts) { const d = new Date(ts); return `${this.pad(d.getHours())}:${this.pad(d.getMinutes())}`; },
  DAYS: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"],
  dayShort(dateStr) { return ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"][new Date(dateStr + "T12:00:00").getDay()]; },
  dm(dateStr) { const [, m, d] = dateStr.split("-"); return `${+d}.${+m}`; },
  rel(ts) {
    const diff = ts - Date.now(), a = Math.abs(diff), h = Math.floor(a / 36e5), m = Math.floor((a % 36e5) / 6e4);
    const txt = h >= 24 ? `${Math.floor(h / 24)} ימים` : h ? `${h} ש׳ ${m} ד׳` : `${m} דק׳`;
    return diff >= 0 ? `בעוד ${txt}` : `לפני ${txt}`;
  },
};

/* ===================== Store =====================
 * מצב הדגמה: localStorage + סנכרון בין לשוניות.
 * מצב מבצעי: Firebase (Auth + Firestore) — נבחר אוטומטית כשה-config ב-firebase-config.js מלא.
 */
const Store = (() => {
  const KEY = "gdud66-v2";
  let state = null, live = null, profile = null;
  const subs = new Set();
  const bc = "BroadcastChannel" in self ? new BroadcastChannel("gdud66") : null;
  const load = () => { try { state = JSON.parse(localStorage.getItem(KEY)); } catch { state = null; } };
  const save = () => { if (live) return; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  const emit = () => subs.forEach(f => f(state));
  function setPath(obj, path, val) {
    let o = obj;
    for (let i = 0; i < path.length - 1; i++) { if (o[path[i]] == null || typeof o[path[i]] !== "object") o[path[i]] = {}; o = o[path[i]]; }
    if (val === undefined) delete o[path[path.length - 1]]; else o[path[path.length - 1]] = val;
  }
  const onRemote = s => { state = s; emit(); };

  return {
    async init() {
      const cfg = self.FIREBASE_CONFIG;
      if (cfg && cfg.apiKey) {
        state = { v: 2, batteries: {}, staff: {}, alerts: {}, acks: {} };
        live = await Live.init(cfg, onRemote);
        profile = await live.restore();
        return;
      }
      load();
      if (!state || state.v !== 2) { state = Seed.build(); save(); }
      bc && (bc.onmessage = () => { load(); emit(); });
      addEventListener("storage", e => { if (e.key === KEY) { load(); emit(); } });
    },
    get: () => state,
    mode: () => (live ? "live" : "demo"),
    profile: () => profile,
    sub: f => subs.add(f),
    async login(pn, code) { profile = await live.login(pn, code); return profile; },
    async logout() { profile = null; if (live) await live.logout(); },
    async bootstrap(pn, code, name) { profile = await live.bootstrap(pn, code, name); return profile; },
    createAccount: (pn, code, role) => live ? live.createAccount(pn, code, role) : Promise.resolve(),
    deleteRole: pn => live ? live.deleteRole(pn) : Promise.resolve(),
    changeCode: code => live.changeCode(code),
    /** ops: [[pathArray, value | undefined(=delete)], ...] */
    write(ops) {
      ops.forEach(([p, v]) => setPath(state, p, v === undefined ? undefined : JSON.parse(JSON.stringify(v))));
      save(); bc && !live && bc.postMessage(1); emit();
      if (live) live.write(ops).catch(e => { console.error("sync error", e); self.dispatchEvent(new CustomEvent("g66-sync-error", { detail: e })); });
    },
    reset() { if (live) return; state = Seed.build(); save(); bc && bc.postMessage(1); emit(); },
  };
})();

/* ===================== Firebase ===================== */
const Live = {
  async init(cfg, onState) {
    const V = "10.12.2", base = `https://www.gstatic.com/firebasejs/${V}`;
    const [{ initializeApp }, A, F] = await Promise.all([import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`)]);
    const app = initializeApp(cfg);
    const auth = A.getAuth(app);
    const db = F.getFirestore(app);
    const email = pn => `${String(pn).trim()}@${cfg.authDomain}`;
    const col = "gdud66";
    let state = { v: 2, batteries: {}, staff: {}, alerts: {}, acks: {} };
    let unsubs = [];

    const docOf = path => (path[0] === "batteries" ? [`battery_${path[1]}`, path.slice(2)] : [path[0], path.slice(1)]);

    async function loadProfile(user) {
      const pn = user.email.split("@")[0];
      const snap = await F.getDoc(F.doc(db, "roles", pn));
      if (!snap.exists()) throw Object.assign(new Error("no-role"), { code: "app/no-role" });
      return { pn, ...snap.data() };
    }
    function subscribe(p) {
      unsubs.forEach(u => u()); unsubs = [];
      state = { v: 2, batteries: {}, staff: {}, alerts: {}, acks: {} };
      const ids = (p.role === "mgd" ? ["a", "b", "g", "m"] : [p.battery]).map(b => `battery_${b}`).concat(["staff", "alerts", "acks"]);
      return Promise.all(ids.map(id => new Promise((res, rej) => {
        let first = true;
        unsubs.push(F.onSnapshot(F.doc(db, col, id), d => {
          const data = d.exists() ? d.data() : null;
          if (id.startsWith("battery_")) { if (data) state.batteries[id.slice(8)] = data; }
          else state[id] = data || {};
          if (first) { first = false; res(); } else onState({ ...state });
        }, e => { console.error(id, e); if (first) { first = false; rej(e); } }));
      }))).then(() => onState({ ...state }));
    }

    return {
      restore: () => new Promise(res => {
        const off = A.onAuthStateChanged(auth, async user => {
          off();
          if (!user) return res(null);
          try { const p = await loadProfile(user); await subscribe(p); res(p); }
          catch (e) { console.warn(e); await A.signOut(auth); res(null); }
        });
      }),
      async login(pn, code) {
        await A.signInWithEmailAndPassword(auth, email(pn), code);
        try { const p = await loadProfile(auth.currentUser); await subscribe(p); return p; }
        catch (e) { await A.signOut(auth); throw e; }
      },
      async logout() { unsubs.forEach(u => u()); unsubs = []; await A.signOut(auth); },
      async bootstrap(pn, code, name) {
        try { await A.createUserWithEmailAndPassword(auth, email(pn), code); }
        catch (e) { if (e.code === "auth/email-already-in-use") await A.signInWithEmailAndPassword(auth, email(pn), code); else throw e; }
        const sid = "u" + pn;
        const b1 = F.writeBatch(db);
        b1.set(F.doc(db, "roles", pn), { role: "mgd", battery: null, sid });
        b1.set(F.doc(db, col, "meta"), { setupAt: Date.now(), by: pn });
        await b1.commit();
        const seed = Seed.build(true);
        const b2 = F.writeBatch(db);
        Object.entries(seed.batteries).forEach(([k, v]) => b2.set(F.doc(db, col, `battery_${k}`), v));
        b2.set(F.doc(db, col, "staff"), { [sid]: { id: sid, name, pn, role: "mgd", battery: null } });
        b2.set(F.doc(db, col, "alerts"), {});
        b2.set(F.doc(db, col, "acks"), {});
        await b2.commit();
        const p = await loadProfile(auth.currentUser); await subscribe(p); return p;
      },
      /* יצירת חשבון לאדם אחר — דרך מופע משני כדי שהמפקד לא יתנתק */
      async createAccount(pn, code, role) {
        if (code) {
          const sec = initializeApp(cfg, "admin-" + Date.now());
          const sa = A.getAuth(sec);
          try { await A.createUserWithEmailAndPassword(sa, email(pn), code); }
          catch (e) { if (e.code !== "auth/email-already-in-use") throw e; }
          finally { try { await A.signOut(sa); } catch {} }
        }
        await F.setDoc(F.doc(db, "roles", String(pn)), role);
      },
      deleteRole: pn => F.deleteDoc(F.doc(db, "roles", String(pn))),
      changeCode: code => A.updatePassword(auth.currentUser, code),
      async write(ops) {
        const byDoc = new Map();
        ops.forEach(([path, val]) => {
          const [docId, rest] = docOf(path);
          if (!byDoc.has(docId)) byDoc.set(docId, []);
          byDoc.get(docId).push([rest, val]);
        });
        const batch = F.writeBatch(db);
        byDoc.forEach((list, docId) => {
          const ref = F.doc(db, col, docId);
          const whole = list.find(([rest]) => !rest.length);
          if (whole) { whole[1] === undefined ? batch.delete(ref) : batch.set(ref, whole[1]); return; }
          const args = [];
          list.forEach(([rest, val]) => args.push(new F.FieldPath(...rest.map(String)), val === undefined ? F.deleteField() : val));
          batch.update(ref, ...args);
        });
        await batch.commit();
      },
    };
  },
};

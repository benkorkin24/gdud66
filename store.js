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

  function shiftBattery(id, letter, pnBase) {
    const b = { id, name: `סוללה ${letter}`, letter, kind: "shift", shifts: {}, soldiers: {}, slots: {}, arrivals: {} };
    for (let s = 1; s <= 4; s++) b.shifts["s" + s] = { id: "s" + s, name: `משמרת ${s}`, color: SHIFT_COLORS[s - 1] };
    let n = 0;
    for (let s = 1; s <= 4; s++) for (let i = 0; i < 30; i++) {
      n++; const sid = `${id}${pad(n, 3)}`;
      b.soldiers[sid] = { id: sid, name: name(), pn: String(pnBase + n), phone: phone(), shift: "s" + s };
    }
    // שבצ"ק לדוגמה: 3 משמרות של 8 שעות ביום, סבב 1→4
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 3);
    let k = 0;
    for (let d = 0; d < 21; d++) {
      const day = new Date(start); day.setDate(start.getDate() + d);
      [["06:00", "14:00"], ["14:00", "22:00"], ["22:00", "06:00"]].forEach(([st, en]) => {
        const slotId = `sl${id}${d}${st.slice(0, 2)}`;
        b.slots[slotId] = { id: slotId, shift: "s" + ((k % 4) + 1), date: ymd(day), start: st, end: en };
        k++;
      });
    }
    return b;
  }

  function locBattery(id, letter, pnBase, locNames) {
    const b = { id, name: `סוללה ${letter}`, letter, kind: "loc", locations: {}, soldiers: {}, locArrivals: {}, teams: {} };
    locNames.forEach((nm, i) => b.locations["l" + (i + 1)] = { id: "l" + (i + 1), name: nm });
    const locIds = Object.keys(b.locations);
    const now = Date.now();
    for (let n = 1; n <= 72; n++) {
      const sid = `${id}${pad(n, 3)}`;
      b.soldiers[sid] = { id: sid, name: name(), pn: String(pnBase + n), phone: phone(), loc: n <= 66 ? locIds[(n - 1) % locIds.length] : null, locAt: now - 3600e3 * 6 };
    }
    const sids = Object.keys(b.soldiers);
    for (let t = 1; t <= 2; t++) {
      b.teams["t" + t] = { id: "t" + t, name: `צוות מיוחד ${t}`, roles: TEAM_ROLES.map((title, i) => ({ title, sid: sids[(t - 1) * 7 + i + 50] || null })) };
    }
    return b;
  }

  function build() {
    seed = 66;
    const batteries = {
      a: shiftBattery("a", "א׳", 7100000),
      b: locBattery("b", "ב׳", 7200000, ["אתר אלפא", "אתר בראבו", "אתר צ׳ארלי", "אתר דלתא", "אתר אקו", "אתר פוקסטרוט"]),
      g: locBattery("g", "ג׳", 7300000, ["נקודה 1", "נקודה 2", "נקודה 3", "נקודה 4", "נקודה 5"]),
      m: shiftBattery("m", "מ׳", 7400000),
    };
    // נוכחות לדוגמה במשמרת הנוכחית ובמיקומים
    const now = Date.now();
    ["a", "m"].forEach(bid => {
      const b = batteries[bid];
      const cur = Object.values(b.slots).find(s => Time.slotStart(s) <= now && Time.slotEnd(s) > now);
      if (!cur) return;
      b.arrivals[cur.id] = {};
      Object.values(b.soldiers).filter(s => s.shift === cur.shift).forEach(s => { if (rnd() < 0.7) b.arrivals[cur.id][s.id] = now - Math.floor(rnd() * 3600e3); });
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
    return { v: 1, batteries, staff, alerts: {} };
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

const Store = (() => {
  const KEY = "gdud66-v1";
  let state = null, remote = null;
  const subs = new Set();
  const bc = "BroadcastChannel" in self ? new BroadcastChannel("gdud66") : null;

  const load = () => { try { state = JSON.parse(localStorage.getItem(KEY)); } catch { state = null; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  const emit = () => subs.forEach(f => f(state));
  function setPath(obj, path, val) {
    let o = obj;
    for (let i = 0; i < path.length - 1; i++) { if (o[path[i]] == null || typeof o[path[i]] !== "object") o[path[i]] = {}; o = o[path[i]]; }
    if (val === undefined) delete o[path[path.length - 1]]; else o[path[path.length - 1]] = val;
  }

  return {
    async init() {
      load();
      if (!state || state.v !== 1) { state = Seed.build(); save(); }
      bc && (bc.onmessage = () => { load(); emit(); });
      addEventListener("storage", e => { if (e.key === KEY) { load(); emit(); } });
      const cfg = self.FIREBASE_CONFIG;
      if (cfg && cfg.apiKey) {
        try { remote = await FirebaseBackend.connect(cfg, state, s => { state = s; save(); emit(); }); }
        catch (e) { console.warn("Firebase connect failed, staying local", e); }
      }
    },
    get: () => state,
    mode: () => (remote ? "live" : "demo"),
    sub: f => subs.add(f),
    /** ops: [[pathArray, value | undefined(=delete)], ...] */
    write(ops) {
      ops.forEach(([p, v]) => setPath(state, p, v === undefined ? undefined : JSON.parse(JSON.stringify(v))));
      save(); bc && bc.postMessage(1); emit();
      remote && remote.write(ops).catch(e => console.error("sync error", e));
    },
    reset() { state = Seed.build(); save(); bc && bc.postMessage(1); emit(); remote && remote.replaceAll(state); },
  };
})();

/* Firestore: כל מפתח עליון הוא מסמך באוסף gdud66 — battery_a, battery_b..., staff, alerts */
const FirebaseBackend = {
  async connect(cfg, localState, onRemote) {
    const V = "10.12.2";
    const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
    const fs = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
    const db = fs.getFirestore(initializeApp(cfg));
    const col = fs.collection(db, "gdud66");
    const docOf = path => (path[0] === "batteries" ? [`battery_${path[1]}`, path.slice(2)] : [path[0], path.slice(1)]);
    const toState = snap => {
      const s = { v: 1, batteries: {}, staff: {}, alerts: {} };
      snap.forEach(d => { if (d.id.startsWith("battery_")) s.batteries[d.id.slice(8)] = d.data(); else s[d.id] = d.data(); });
      return s;
    };
    const replaceAll = async st => {
      const batch = fs.writeBatch(db);
      Object.entries(st.batteries).forEach(([k, v]) => batch.set(fs.doc(col, `battery_${k}`), v));
      batch.set(fs.doc(col, "staff"), st.staff); batch.set(fs.doc(col, "alerts"), st.alerts || {});
      await batch.commit();
    };
    const first = await fs.getDocs(col);
    if (first.empty) await replaceAll(localState);
    fs.onSnapshot(col, snap => onRemote(toState(snap)));
    return {
      replaceAll,
      async write(ops) {
        const batch = fs.writeBatch(db);
        ops.forEach(([path, val]) => {
          const [docId, rest] = docOf(path);
          const ref = fs.doc(col, docId);
          if (!rest.length) val === undefined ? batch.delete(ref) : batch.set(ref, val);
          else batch.set(ref, nest(rest, val === undefined ? fs.deleteField() : val), { merge: true });
        });
        await batch.commit();
      },
    };
    function nest(path, v) { const o = {}; let c = o; path.slice(0, -1).forEach(k => (c = c[k] = {})); c[path[path.length - 1]] = v; return o; }
  },
};

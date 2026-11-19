/* גדוד 66 בזמ"א — אפליקציית שליטה בכוח אדם */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const S = () => Store.get();
  const tr = (a, b) => `\u2066${a}–${b}\u2069`;
  const ROLE_NAME = { mgd: "מפקד היחידה", cmd: "מפקד סוללה", dep: "סגן מפקד סוללה", soldier: "לוחם/ת" };
  const SESSION_KEY = "gdud66-session";

  let me = null;          // { kind:'staff'|'soldier', id, battery }
  let ctx = null;         // סוללה בתצוגה (למפקדים)
  let route = "home";
  let ui = { week: 0, slot: null, swapA: null, search: "", openAlert: null };

  /* ---------- זהות והרשאות ---------- */
  function who() {
    if (!me) return null;
    const s = S();
    if (me.kind === "staff") return s.staff[me.id] ? { ...s.staff[me.id], kind: "staff" } : null;
    const b = s.batteries[me.battery]; const sol = b && b.soldiers[me.id];
    return sol ? { ...sol, role: "soldier", battery: me.battery, kind: "soldier" } : null;
  }
  const isStaff = () => me && me.kind === "staff";
  function canEdit(bid) {
    const u = who(); if (!u || u.kind !== "staff") return false;
    return u.role === "mgd" || ((u.role === "cmd" || u.role === "dep") && u.battery === bid);
  }
  function login(pn) {
    pn = String(pn).trim(); const s = S();
    const st = Object.values(s.staff).find(x => x.pn === pn);
    if (st) { me = { kind: "staff", id: st.id, battery: st.battery }; ctx = st.battery || "a"; }
    else {
      for (const b of Object.values(s.batteries)) {
        const sol = Object.values(b.soldiers).find(x => x.pn === pn);
        if (sol) { me = { kind: "soldier", id: sol.id, battery: b.id }; ctx = b.id; break; }
      }
    }
    if (!me) return false;
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(me)); } catch {}
    route = isStaff() ? (who().role === "mgd" ? "overview" : "home") : "home";
    return true;
  }
  function logout() { me = null; try { localStorage.removeItem(SESSION_KEY); } catch {} render(); }

  /* ---------- חישובי משמרות ---------- */
  const slotsOf = b => Object.values(b.slots || {}).sort((x, y) => Time.slotStart(x) - Time.slotStart(y));
  function currentSlot(b, shiftId) {
    const now = Date.now();
    const list = slotsOf(b).filter(s => !shiftId || s.shift === shiftId);
    return list.find(s => Time.slotStart(s) <= now && Time.slotEnd(s) > now) || list.find(s => Time.slotStart(s) > now) || null;
  }
  const arrivalOpen = s => { const n = Date.now(); return n >= Time.slotStart(s) - 3 * 36e5 && n < Time.slotEnd(s); };
  const membersOf = (b, shiftId) => Object.values(b.soldiers).filter(x => x.shift === shiftId).sort((a, c) => a.name.localeCompare(c.name, "he"));
  const locPresent = (b, sol) => { const a = b.locArrivals && b.locArrivals[sol.id]; return !!(a && sol.loc && a.loc === sol.loc && a.at >= (sol.locAt || 0)); };
  function batteryStats(b) {
    if (b.kind === "shift") {
      const sl = currentSlot(b); if (!sl) return { present: 0, total: 0, label: "אין משמרת" };
      const arr = (b.arrivals && b.arrivals[sl.id]) || {};
      const mem = membersOf(b, sl.shift);
      const live = Time.slotStart(sl) <= Date.now();
      return { present: mem.filter(m => arr[m.id]).length, total: mem.length, label: `${b.shifts[sl.shift].name} · ${live ? "פעילה" : "הבאה"} ${tr(sl.start, sl.end)}` };
    }
    const assigned = Object.values(b.soldiers).filter(x => x.loc);
    return { present: assigned.filter(x => locPresent(b, x)).length, total: assigned.length, label: `${Object.keys(b.locations).length} מיקומים · ${Object.keys(b.teams || {}).length} צוותים מיוחדים` };
  }
  function alertTargets(a) {
    const b = S().batteries[a.battery]; if (!b) return [];
    const all = Object.values(b.soldiers);
    if (a.target.type === "all") return all;
    if (a.target.type === "shift") return all.filter(x => x.shift === a.target.id);
    if (a.target.type === "loc") return all.filter(x => x.loc === a.target.id);
    if (a.target.type === "team") { const t = b.teams[a.target.id]; const ids = new Set((t ? t.roles : []).map(r => r.sid)); return all.filter(x => ids.has(x.id)); }
    return [];
  }
  function targetName(a) {
    const b = S().batteries[a.battery]; const t = a.target;
    if (t.type === "all") return `כל ${b.name}`;
    if (t.type === "shift") return b.shifts[t.id]?.name || "משמרת";
    if (t.type === "loc") return b.locations[t.id]?.name || "מיקום";
    if (t.type === "team") return b.teams[t.id]?.name || "צוות";
  }
  function myAlerts() {
    const u = who(); if (!u || u.kind !== "soldier") return [];
    return Object.values(S().alerts || {}).filter(a => alertTargets(a).some(x => x.id === u.id)).sort((x, y) => x.when.localeCompare(y.when));
  }

  /* ---------- רכיבים ---------- */
  const EMBLEM = `<svg class="emblem" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M32 3 56 11v19c0 15-10 26-24 31C18 56 8 45 8 30V11z" fill="#0d1a14" stroke="var(--amber)" stroke-width="2.5"/>
    <path d="M18 44a19 19 0 0 1 28 0M22 48a13 13 0 0 1 20 0" fill="none" stroke="var(--phos)" stroke-width="1.6" opacity=".7"/>
    <path d="M32 50 44 18" stroke="var(--phos)" stroke-width="1" stroke-dasharray="2 2" opacity=".6"/>
    <g transform="rotate(21 40 22)"><path d="M40 10l3 6v12h-6V16z" fill="#e8f1ea"/><path d="M37 26l-3 4h3zM43 26l3 4h-3z" fill="var(--amber)"/><path d="M38.5 29h3l-1.5 6z" fill="#ff6a3d"/></g>
    <text x="32" y="44" text-anchor="middle" font-family="Karantina,sans-serif" font-size="15" font-weight="700" fill="var(--amber)">66</text></svg>`;
  const radar = (pct, size = 92) => {
    const r = 38, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct)));
    return `<svg class="gauge" width="${size}" height="${size}" viewBox="0 0 92 92">
      <circle cx="46" cy="46" r="${r}" class="g-bg"/><circle cx="46" cy="46" r="26" class="g-ring"/><circle cx="46" cy="46" r="14" class="g-ring"/>
      <circle cx="46" cy="46" r="${r}" class="g-fg" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 46 46)"/>
      <text x="46" y="52" text-anchor="middle" class="g-txt">${Math.round(pct * 100)}%</text></svg>`;
  };
  const pill = (ok, txtOk = "נוכח", txtNo = "לא נוכח") => `<span class="pill ${ok ? "ok" : "no"}">${ok ? txtOk : txtNo}</span>`;
  const panel = (title, body, extra = "") => `<section class="panel"><header class="panel-h"><h3>${title}</h3>${extra}</header>${body}</section>`;
  const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel ? "selected" : ""}>${esc(label)}</option>`;

  /* ---------- מסך כניסה ---------- */
  function viewLogin() {
    const s = S();
    const demo = [["1000001", "מפקד היחידה"], ["1000011", "מ״ס א׳"], ["1000012", "סמ״ס א׳"], ["1000021", "מ״ס ב׳"], ["1000041", "מ״ס מ׳"],
      [Object.values(s.batteries.a.soldiers)[0].pn, "לוחם סוללה א׳"], [Object.values(s.batteries.b.soldiers)[0].pn, "לוחם סוללה ב׳"]];
    return `<div class="login">
      <div class="radar-bg"><div class="sweep"></div></div>
      <div class="login-card">
        ${EMBLEM}
        <h1>גדוד 66 <span>בזמ״א</span></h1>
        <p class="sub">מערך הגנה אווירית · שליטה בכוח אדם</p>
        <form id="loginForm" autocomplete="off">
          <label>מספר אישי</label>
          <input id="pn" inputmode="numeric" pattern="[0-9]*" placeholder="7 ספרות" required>
          <button class="btn primary big" type="submit">כניסה למערכת</button>
          <p class="err" id="loginErr"></p>
        </form>
        ${Store.mode() === "demo" ? `<div class="demo"><p>מצב הדגמה — כניסה מהירה:</p><div class="chips">${demo.map(([pn, l]) => `<button class="chip" data-act="demo-login" data-pn="${pn}">${l}</button>`).join("")}</div></div>` : ""}
      </div></div>`;
  }

  /* ---------- מסגרת ---------- */
  function navItems() {
    const u = who();
    if (u.kind === "soldier") {
      const b = S().batteries[u.battery];
      return [["home", "ראשי", "◎"], ...(b.kind === "shift" ? [["schedule", "שבצ״ק", "▦"]] : []), ["alerts", "זימונים", "⚑"]];
    }
    const b = S().batteries[ctx];
    return [...(u.role === "mgd" ? [["overview", "תמונת מצב", "◈"]] : []), ["home", "לוח בקרה", "◎"],
      ...(b.kind === "shift" ? [["schedule", "שבצ״ק", "▦"]] : [["teams", "צוותים מיוחדים", "✦"]]),
      ["people", "כוח אדם", "☰"], ["summon", "זימון לאימון", "⚑"]];
  }
  function shell(content) {
    const u = who(); const s = S();
    const batSel = u.kind === "staff" && u.role === "mgd" && route !== "overview"
      ? `<select class="bat-sel" data-act="ctx">${Object.values(s.batteries).map(b => opt(b.id, b.name, b.id === ctx)).join("")}</select>` : "";
    const badge = u.kind === "soldier" ? myAlerts().filter(a => !(a.acks || {})[u.id]).length : 0;
    return `<header class="top">
        <div class="brand">${EMBLEM}<div><b>גדוד 66 בזמ״א</b><small>${Store.mode() === "live" ? '<i class="live"></i>מחובר · זמן אמת' : "מצב הדגמה"}</small></div></div>
        <div class="me">${batSel}<div class="me-txt"><b>${esc(u.name)}</b><small>${ROLE_NAME[u.role]}${u.battery ? " · " + s.batteries[u.battery].name : ""}</small></div>
        <button class="icon-btn" data-act="logout" title="יציאה">⏻</button></div>
      </header>
      <nav class="tabs">${navItems().map(([r, l, i]) => `<button class="tab ${route === r ? "on" : ""}" data-act="go" data-r="${r}"><span>${i}</span>${l}${r === "alerts" && badge ? `<em>${badge}</em>` : ""}</button>`).join("")}</nav>
      <main class="main">${content}</main>`;
  }

  /* ---------- לוחם ---------- */
  function viewSoldierHome() {
    const u = who(); const b = S().batteries[u.battery];
    let mission = "";
    if (b.kind === "shift") {
      const sh = b.shifts[u.shift]; const sl = currentSlot(b, u.shift);
      if (!sl) mission = panel("המשמרת שלי", `<p class="muted">אין משמרות משובצות כרגע.</p>`);
      else {
        const arrived = (b.arrivals?.[sl.id] || {})[u.id]; const open = arrivalOpen(sl); const live = Time.slotStart(sl) <= Date.now();
        mission = `<section class="mission" style="--sc:${sh.color}">
          <div class="m-head"><span class="tag" style="--sc:${sh.color}">${sh.name}</span>${pill(arrived)}</div>
          <p class="m-lbl">${live ? "משמרת פעילה עכשיו" : "המשמרת הבאה שלך"}</p>
          <div class="m-time">${Time.dayShort(sl.date)} ${Time.dm(sl.date)} <b>${tr(sl.start, sl.end)}</b></div>
          <p class="m-rel">${live ? "התחילה " + Time.rel(Time.slotStart(sl)) : "מתחילה " + Time.rel(Time.slotStart(sl))}</p>
          ${arrived ? `<div class="arrived">✓ דיווחת הגעה ב-${Time.hm(arrived)}</div>`
            : `<button class="btn arrive" data-act="arrive-shift" data-slot="${sl.id}" ${open ? "" : "disabled"}>הגעתי</button>
               ${open ? "" : `<p class="muted small">ניתן לדווח הגעה החל מ-3 שעות לפני תחילת המשמרת.</p>`}`}
        </section>`;
        const next = slotsOf(b).filter(s => s.shift === u.shift && Time.slotEnd(s) > Date.now()).slice(0, 10);
        mission += panel("המשמרות הקרובות של " + sh.name, `<ul class="slot-list">${next.map(s => `<li><span>${Time.DAYS[new Date(s.date + "T12:00").getDay()]} ${Time.dm(s.date)}</span><b>${tr(s.start, s.end)}</b></li>`).join("")}</ul>`);
      }
    } else {
      const loc = u.loc && b.locations[u.loc]; const present = locPresent(b, u);
      mission = `<section class="mission" style="--sc:var(--phos)">
        <div class="m-head"><span class="tag">יעד מוגדר</span>${pill(present, "הגעתי ליעד", "טרם הגיע")}</div>
        <p class="m-lbl">המיקום שאליו הונחית/ה להגיע</p>
        <div class="m-time"><b>${loc ? esc(loc.name) : "טרם שובצת למיקום"}</b></div>
        ${loc ? `<p class="m-rel">עודכן ${Time.rel(u.locAt || Date.now())}</p>` : ""}
        ${!loc ? "" : present ? `<div class="arrived">✓ דיווחת הגעה ב-${Time.hm(b.locArrivals[u.id].at)}</div>` : `<button class="btn arrive" data-act="arrive-loc">הגעתי</button>`}
      </section>`;
      const team = Object.values(b.teams || {}).find(t => t.roles.some(r => r.sid === u.id));
      if (team) mission += panel(esc(team.name), `<ul class="team-list">${team.roles.map(r => { const p = b.soldiers[r.sid]; return `<li class="${r.sid === u.id ? "me-row" : ""}"><span>${esc(r.title)}</span><b>${p ? esc(p.name) : "—"}</b></li>`; }).join("")}</ul>`);
      if (loc) {
        const mates = Object.values(b.soldiers).filter(x => x.loc === u.loc && x.id !== u.id);
        mission += panel(`איתך ב${esc(loc.name)} (${mates.length})`, `<div class="roster">${mates.map(m => `<div class="sol ${locPresent(b, m) ? "on" : ""}"><i></i>${esc(m.name)}</div>`).join("")}</div>`);
      }
    }
    const pending = myAlerts().filter(a => !(a.acks || {})[u.id]);
    return (pending.length ? `<button class="alert-strip" data-act="go" data-r="alerts">⚑ יש לך ${pending.length} זימונים שלא אושרו</button>` : "") + mission;
  }
  function viewSoldierAlerts() {
    const u = who(); const list = myAlerts();
    if (!list.length) return panel("זימונים", `<p class="muted">אין זימונים פעילים.</p>`);
    return list.map(a => alertCard(a, u)).join("");
  }
  function alertCard(a, u) {
    const acked = (a.acks || {})[u.id];
    return `<section class="summon ${acked ? "acked" : ""}">
      <div class="s-head"><span class="tag red">זימון לאימון</span><small>${esc(targetName(a))}</small></div>
      <h3>${esc(a.title || "אימון")}</h3>
      <div class="s-grid"><div><small>תאריך</small><b>${Time.DAYS[new Date(a.date + "T12:00").getDay()]} ${Time.dm(a.date)}</b></div><div><small>שעה</small><b>${a.time}</b></div><div><small>מקום</small><b>${esc(a.place || "—")}</b></div></div>
      ${a.note ? `<p class="s-note">${esc(a.note)}</p>` : ""}
      ${acked ? `<div class="arrived">✓ אישרת קבלה ב-${Time.hm(acked)}</div>` : `<button class="btn primary" data-act="ack" data-id="${a.id}">קיבלתי, אגיע</button>`}
    </section>`;
  }

  /* ---------- מג"ד: תמונת מצב ---------- */
  function viewOverview() {
    const s = S(); let P = 0, T = 0;
    const cards = Object.values(s.batteries).map(b => {
      const st = batteryStats(b); P += st.present; T += st.total;
      return `<button class="bat-card" data-act="open-bat" data-b="${b.id}">
        <div class="bc-top"><span class="bc-letter">${b.letter}</span><div><b>${b.name}</b><small>${b.kind === "shift" ? "4 משמרות × 30" : "פריסה במיקומים"}</small></div></div>
        ${radar(st.total ? st.present / st.total : 0)}
        <div class="bc-num"><b>${st.present}</b>/${st.total} נוכחים</div><small class="muted">${st.label}</small></button>`;
    }).join("");
    const alerts = Object.values(s.alerts || {}).sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
    return `<section class="hero"><div><p class="m-lbl">נוכחות כוללת בגדוד</p><div class="hero-num"><b>${P}</b> / ${T}</div><p class="muted">משמרות פעילות בסוללות א׳ ומ׳ + פריסה בסוללות ב׳ וג׳</p></div>${radar(T ? P / T : 0, 120)}</section>
      <div class="bat-grid">${cards}</div>
      ${panel("זימונים אחרונים בגדוד", alerts.length ? alertTable(alerts) : `<p class="muted">טרם נשלחו זימונים.</p>`)}`;
  }

  /* ---------- מפקד: לוח בקרה ---------- */
  function viewCmdHome() {
    const b = S().batteries[ctx];
    return b.kind === "shift" ? cmdShiftBoard(b) : cmdLocBoard(b);
  }
  function cmdShiftBoard(b) {
    const all = slotsOf(b);
    const cur = currentSlot(b);
    let sl = (ui.slot && b.slots[ui.slot]) || cur;
    const around = all.filter(s => Time.slotEnd(s) > Date.now() - 864e5 && Time.slotStart(s) < Date.now() + 2 * 864e5);
    const shiftCards = Object.values(b.shifts).map(sh => {
      const n = currentSlot(b, sh.id); const live = n && Time.slotStart(n) <= Date.now();
      return `<div class="shift-card" style="--sc:${sh.color}"><b>${sh.name}</b><small>${membersOf(b, sh.id).length} אנשים</small><span>${n ? `${live ? "● פעילה" : "הבאה"} · ${Time.dayShort(n.date)} ${Time.dm(n.date)} ${n.start}` : "—"}</span></div>`;
    }).join("");
    if (!sl) return `<div class="shift-row">${shiftCards}</div>` + panel("נוכחות", `<p class="muted">אין משמרות בשבצ״ק. עבור/י ללשונית שבצ״ק כדי לבנות.</p>`);
    const sh = b.shifts[sl.shift]; const arr = (b.arrivals && b.arrivals[sl.id]) || {}; const mem = membersOf(b, sl.shift);
    const present = mem.filter(m => arr[m.id]).length; const edit = canEdit(b.id);
    return `<div class="shift-row">${shiftCards}</div>
      <section class="hero" style="--sc:${sh.color}"><div>
        <label class="m-lbl">משמרת בתצוגה</label>
        <select data-act="pick-slot">${around.map(s => opt(s.id, `${Time.dayShort(s.date)} ${Time.dm(s.date)} ${tr(s.start, s.end)} · ${b.shifts[s.shift].name}${s.id === cur?.id ? " (נוכחית)" : ""}`, s.id === sl.id)).join("")}</select>
        <div class="hero-num"><b>${present}</b> / ${mem.length} <span class="tag" style="--sc:${sh.color}">${sh.name}</span></div>
        <p class="muted">${present === mem.length ? "כל המשמרת נוכחת ✓" : `${mem.length - present} טרם דיווחו הגעה`}${edit ? " · לחיצה על לוחם מסמנת נוכחות ידנית" : ""}</p>
      </div>${radar(mem.length ? present / mem.length : 0, 120)}</section>
      ${panel("סטטוס לוחמים", `<div class="roster">${mem.sort((x, y) => (!!arr[y.id]) - (!!arr[x.id])).map(m => `<button class="sol ${arr[m.id] ? "on" : ""}" ${edit ? `data-act="toggle-arr" data-slot="${sl.id}" data-s="${m.id}"` : "disabled"}><i></i><span>${esc(m.name)}</span><small>${arr[m.id] ? Time.hm(arr[m.id]) : "לא נוכח"}</small></button>`).join("")}</div>`)}`;
  }
  function cmdLocBoard(b) {
    const edit = canEdit(b.id); const sols = Object.values(b.soldiers);
    const locOpts = cur => opt("", "— ללא מיקום —", !cur) + Object.values(b.locations).map(l => opt(l.id, l.name, l.id === cur)).join("");
    const card = (l) => {
      const mem = sols.filter(x => x.loc === l.id).sort((a, c) => locPresent(b, c) - locPresent(b, a));
      const p = mem.filter(x => locPresent(b, x)).length;
      return `<section class="loc-card"><header>
          <div><h3>${esc(l.name)}</h3><small>${p}/${mem.length} הגיעו</small></div>
          ${edit ? `<div class="row"><button class="icon-btn" data-act="rename-loc" data-l="${l.id}" title="שינוי שם">✎</button><button class="icon-btn" data-act="del-loc" data-l="${l.id}" title="מחיקה">✕</button></div>` : ""}
        </header><div class="bar"><i style="width:${mem.length ? (p / mem.length) * 100 : 0}%"></i></div>
        <ul class="loc-list">${mem.map(m => `<li><span class="dot ${locPresent(b, m) ? "on" : ""}"></span><span class="nm">${esc(m.name)}</span>
          ${edit ? `<select data-act="move-loc" data-s="${m.id}">${locOpts(m.loc)}</select>` : `<small>${locPresent(b, m) ? "הגיע" : "בדרך"}</small>`}</li>`).join("") || `<li class="muted">אין לוחמים במיקום</li>`}</ul></section>`;
    };
    const st = batteryStats(b);
    const unassigned = sols.filter(x => !x.loc);
    return `<section class="hero"><div><p class="m-lbl">${b.name} · פריסה במיקומים</p><div class="hero-num"><b>${st.present}</b> / ${st.total}</div><p class="muted">הגיעו ליעד שהוגדר להם · שינוי מיקום מאפס את דיווח ההגעה</p>
        ${edit ? `<button class="btn" data-act="add-loc">＋ מיקום חדש</button>` : ""}</div>${radar(st.total ? st.present / st.total : 0, 120)}</section>
      <div class="loc-grid">${Object.values(b.locations).map(card).join("")}</div>
      ${panel(`ממתינים לשיבוץ (${unassigned.length})`, `<ul class="loc-list">${unassigned.map(m => `<li><span class="dot"></span><span class="nm">${esc(m.name)}</span>${edit ? `<select data-act="move-loc" data-s="${m.id}">${locOpts(null)}</select>` : ""}</li>`).join("") || `<li class="muted">כולם משובצים</li>`}</ul>`)}`;
  }

  /* ---------- שבצ"ק ---------- */
  function viewSchedule() {
    const b = S().batteries[isStaff() ? ctx : me.battery]; const edit = canEdit(b.id);
    const base = new Date(); base.setHours(0, 0, 0, 0); base.setDate(base.getDate() - base.getDay() + ui.week * 7);
    const days = [...Array(7)].map((_, i) => { const d = new Date(base); d.setDate(base.getDate() + i); return Time.ymd(d); });
    const today = Time.ymd(new Date()); const mine = !isStaff() ? who().shift : null;
    const cols = days.map(ds => {
      const daySlots = Object.values(b.slots).filter(s => s.date === ds).sort((x, y) => x.start.localeCompare(y.start));
      return `<div class="day ${ds === today ? "today" : ""}"><header><b>${Time.DAYS[new Date(ds + "T12:00").getDay()]}</b><small>${Time.dm(ds)}</small></header>
        ${daySlots.map(s => { const sh = b.shifts[s.shift]; const live = Time.slotStart(s) <= Date.now() && Time.slotEnd(s) > Date.now();
          return `<button class="slot ${live ? "now" : ""} ${mine && s.shift !== mine ? "dim" : ""}" style="--sc:${sh.color}" ${edit ? `data-act="edit-slot" data-id="${s.id}"` : "disabled"}><b>${tr(s.start, s.end)}</b><span>${sh.name}</span></button>`; }).join("")}
        ${edit ? `<button class="slot add" data-act="new-slot" data-date="${ds}">＋</button>` : ""}</div>`;
    }).join("");
    const legend = Object.values(b.shifts).map(sh => `<span class="tag" style="--sc:${sh.color}">${sh.name}</span>`).join("");
    return `<div class="sched-bar">
        <div class="row"><button class="btn" data-act="week" data-d="-1">‹ שבוע קודם</button><button class="btn ghost" data-act="week" data-d="0">השבוע</button><button class="btn" data-act="week" data-d="1">שבוע הבא ›</button></div>
        <div class="row legend">${legend}</div>
        ${edit ? `<button class="btn primary" data-act="auto-sched">⚙ בניית שבצ״ק אוטומטית</button>` : ""}
      </div>
      <h2 class="sched-title">שבצ״ק ${b.name} · ${tr(Time.dm(days[0]), Time.dm(days[6]))}</h2>
      <div class="week">${cols}</div>`;
  }

  /* ---------- כוח אדם ---------- */
  function viewPeople() {
    const b = S().batteries[ctx]; const edit = canEdit(b.id); const q = ui.search.trim();
    const sols = Object.values(b.soldiers).filter(x => !q || x.name.includes(q) || x.pn.includes(q)).sort((a, c) => a.name.localeCompare(c.name, "he"));
    const tools = `<div class="people-bar"><input class="search" data-act="search" placeholder="חיפוש לפי שם או מספר אישי" value="${esc(ui.search)}">
      ${edit ? `<button class="btn primary" data-act="add-sol">＋ הוספת לוחם</button>` : ""}</div>
      ${ui.swapA ? `<div class="alert-strip info">מצב החלפה: נבחר/ה <b>${esc(b.soldiers[ui.swapA]?.name)}</b> — בחר/י לוחם ממשמרת אחרת להחלפה <button class="btn ghost" data-act="swap-cancel">ביטול</button></div>` : ""}`;
    const row = x => `<li class="${ui.swapA === x.id ? "sel" : ""}"><div class="nm"><b>${esc(x.name)}</b><small>מ.א. ${x.pn} · ${esc(x.phone || "")}</small></div>
      ${b.kind === "shift"
        ? (edit ? `<select data-act="set-shift" data-s="${x.id}">${Object.values(b.shifts).map(sh => opt(sh.id, sh.name, sh.id === x.shift)).join("")}</select>
            <button class="btn small" data-act="swap" data-s="${x.id}" title="החלפה עם לוחם ממשמרת אחרת">⇄ החלפה</button>` : `<span class="tag" style="--sc:${b.shifts[x.shift].color}">${b.shifts[x.shift].name}</span>`)
        : (edit ? `<select data-act="move-loc" data-s="${x.id}">${opt("", "— ללא מיקום —", !x.loc)}${Object.values(b.locations).map(l => opt(l.id, l.name, l.id === x.loc)).join("")}</select>` : `<span>${esc(b.locations[x.loc]?.name || "—")}</span>`)}
      ${edit ? `<button class="icon-btn" data-act="edit-sol" data-s="${x.id}" title="עריכה">✎</button>` : ""}</li>`;
    let body;
    if (b.kind === "shift") body = Object.values(b.shifts).map(sh => { const l = sols.filter(x => x.shift === sh.id); return panel(`<span class="tag" style="--sc:${sh.color}">${sh.name}</span> ${l.length} אנשים`, `<ul class="people">${l.map(row).join("")}</ul>`); }).join("");
    else body = panel(`${sols.length} לוחמים`, `<ul class="people">${sols.map(row).join("")}</ul>`);
    return tools + body;
  }

  /* ---------- צוותים מיוחדים ---------- */
  function viewTeams() {
    const b = S().batteries[ctx]; const edit = canEdit(b.id);
    const solOpts = cur => opt("", "— לא משובץ —", !cur) + Object.values(b.soldiers).sort((a, c) => a.name.localeCompare(c.name, "he")).map(x => opt(x.id, x.name, x.id === cur)).join("");
    const teams = Object.values(b.teams || {}).map(t => `<section class="team-card"><header><h3>✦ ${esc(t.name)}</h3>${edit ? `<div class="row"><button class="icon-btn" data-act="rename-team" data-t="${t.id}">✎</button><button class="icon-btn" data-act="del-team" data-t="${t.id}">✕</button></div>` : ""}</header>
      <ul class="team-edit">${t.roles.map((r, i) => { const p = b.soldiers[r.sid];
        return `<li><span class="dot ${p && locPresent(b, p) ? "on" : ""}"></span>
          ${edit ? `<input class="role-in" data-act="role-title" data-t="${t.id}" data-i="${i}" value="${esc(r.title)}">` : `<span class="role">${esc(r.title)}</span>`}
          ${edit ? `<select data-act="role-sol" data-t="${t.id}" data-i="${i}">${solOpts(r.sid)}</select>` : `<b>${p ? esc(p.name) : "—"}</b>`}
          <small>${p && p.loc ? esc(b.locations[p.loc]?.name || "") : ""}</small></li>`; }).join("")}</ul></section>`).join("");
    return `<div class="people-bar"><p class="muted">צוותים בני 7 בעלי תפקידים — מעודכנים ע״י מפקד הסוללה. ניתן לערוך את שמות התפקידים.</p>${edit ? `<button class="btn primary" data-act="add-team">＋ צוות חדש</button>` : ""}</div><div class="loc-grid">${teams || `<p class="muted">אין צוותים.</p>`}</div>`;
  }

  /* ---------- זימון לאימון ---------- */
  function viewSummon() {
    const s = S(); const b = s.batteries[ctx]; const edit = canEdit(b.id);
    const tomorrow = new Date(Date.now() + 864e5);
    const targets = [opt("all:", `כל ${b.name}`)]
      .concat(b.kind === "shift" ? Object.values(b.shifts).map(sh => opt("shift:" + sh.id, sh.name, sh.id === "s1")) : [])
      .concat(b.kind === "loc" ? Object.values(b.locations).map(l => opt("loc:" + l.id, "מיקום: " + l.name)) : [])
      .concat(b.kind === "loc" ? Object.values(b.teams || {}).map(t => opt("team:" + t.id, t.name)) : []).join("");
    const list = Object.values(s.alerts || {}).filter(a => a.battery === b.id).sort((x, y) => y.createdAt - x.createdAt);
    return (edit ? panel("זימון חדש", `<form id="summonForm" class="form">
        <label>למי לזמן<select name="target">${targets}</select></label>
        <label>כותרת<input name="title" value="אימון" required></label>
        <div class="row2"><label>תאריך<input type="date" name="date" value="${Time.ymd(tomorrow)}" required></label><label>שעה<input type="time" name="time" value="08:00" required></label></div>
        <label>מקום<input name="place" placeholder="לדוגמה: מגרש מסדרים"></label>
        <label>הערות<textarea name="note" rows="2" placeholder="ציוד, לבוש, הנחיות"></textarea></label>
        <button class="btn primary big" type="submit">⚑ שלח זימון — ההתרעה תקפוץ לכל המזומנים</button></form>`) : "")
      + panel("זימונים שנשלחו", list.length ? alertTable(list) : `<p class="muted">טרם נשלחו זימונים.</p>`);
  }
  function alertTable(list) {
    return `<ul class="alert-list">${list.map(a => { const t = alertTargets(a); const acks = a.acks || {}; const n = t.filter(x => acks[x.id]).length; const open = ui.openAlert === a.id;
      return `<li><button class="al-row" data-act="toggle-alert" data-id="${a.id}"><div><b>${esc(a.title)}</b> · ${esc(targetName(a))}<small>${S().batteries[a.battery].name} · ${Time.dayShort(a.date)} ${Time.dm(a.date)} ${a.time}${a.place ? " · " + esc(a.place) : ""}</small></div>
        <span class="ack-num ${n === t.length ? "full" : ""}">${n}/${t.length} אישרו</span></button>
        ${open ? `<div class="al-detail"><p class="muted small">טרם אישרו:</p><div class="roster">${t.filter(x => !acks[x.id]).map(x => `<div class="sol"><i></i>${esc(x.name)}</div>`).join("") || "<p>כולם אישרו ✓</p>"}</div>
          ${canEdit(a.battery) ? `<button class="btn danger small" data-act="del-alert" data-id="${a.id}">ביטול זימון</button>` : ""}</div>` : ""}</li>`; }).join("")}</ul>`;
  }

  /* ---------- מודאלים ---------- */
  function modal(html, onSubmit) {
    const m = $("#modal"); m.innerHTML = `<div class="modal-card"><form id="mForm" class="form">${html}<div class="row end"><button type="button" class="btn ghost" data-act="close-modal">ביטול</button><button class="btn primary" type="submit">שמירה</button></div></form></div>`;
    m.hidden = false;
    $("#mForm").onsubmit = e => { e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target)); if (onSubmit(fd) !== false) closeModal(); };
    const f = m.querySelector("input,select"); f && f.focus();
  }
  const closeModal = () => { $("#modal").hidden = true; $("#modal").innerHTML = ""; render(); };
  function slotModal(b, slot, date) {
    modal(`<h3>${slot ? "עריכת משמרת" : "משמרת חדשה"} · ${b.name}</h3>
      <label>משמרת<select name="shift">${Object.values(b.shifts).map(sh => opt(sh.id, sh.name, slot ? slot.shift === sh.id : sh.id === "s1")).join("")}</select></label>
      <label>תאריך<input type="date" name="date" value="${slot ? slot.date : date}" required></label>
      <div class="row2"><label>התחלה<input type="time" name="start" value="${slot ? slot.start : "06:00"}" required></label><label>סיום<input type="time" name="end" value="${slot ? slot.end : "14:00"}" required></label></div>
      ${slot ? `<button type="button" class="btn danger" data-act="del-slot" data-id="${slot.id}">מחיקת משמרת זו</button>` : ""}`,
      fd => { const id = slot ? slot.id : uid("sl"); Store.write([[["batteries", b.id, "slots", id], { id, shift: fd.shift, date: fd.date, start: fd.start, end: fd.end }]]); toast("השבצ״ק עודכן"); });
  }
  function autoModal(b) {
    const base = new Date(); base.setDate(base.getDate() - base.getDay() + ui.week * 7);
    modal(`<h3>בניית שבצ״ק אוטומטית · ${b.name}</h3>
      <p class="muted small">יוצר סבב משמרות רציף. משמרות קיימות בטווח יוחלפו.</p>
      <div class="row2"><label>מתאריך<input type="date" name="from" value="${Time.ymd(base)}" required></label><label>מספר ימים<input type="number" name="days" min="1" max="60" value="7" required></label></div>
      <div class="row2"><label>שעת התחלה<input type="time" name="start" value="06:00" required></label>
      <label>אורך משמרת<select name="len">${[4, 6, 8, 12, 24].map(h => opt(h, h + " שעות", h === 8)).join("")}</select></label></div>
      <label>סדר הסבב<select name="order"><option value="s1,s2,s3,s4">1 → 2 → 3 → 4</option><option value="s2,s3,s4,s1">2 → 3 → 4 → 1</option><option value="s3,s4,s1,s2">3 → 4 → 1 → 2</option><option value="s4,s1,s2,s3">4 → 1 → 2 → 3</option></select></label>`,
      fd => {
        const from = new Date(fd.from + "T" + fd.start + ":00"); const days = +fd.days; const len = +fd.len; const order = fd.order.split(",");
        const endTs = from.getTime() + days * 864e5; const ops = [];
        Object.values(b.slots).forEach(s => { const t = Time.slotStart(s); if (t >= from.getTime() && t < endTs) ops.push([["batteries", b.id, "slots", s.id], undefined]); });
        let t = from.getTime(), k = 0;
        while (t < endTs) { const d = new Date(t), e = new Date(t + len * 36e5); const id = uid("sl") + k;
          ops.push([["batteries", b.id, "slots", id], { id, shift: order[k % 4], date: Time.ymd(d), start: Time.hm(t), end: Time.hm(e.getTime()) }]); t += len * 36e5; k++; }
        Store.write(ops); toast(`נבנו ${k} משמרות`);
      });
  }
  function soldierModal(b, sol) {
    modal(`<h3>${sol ? "עריכת לוחם" : "לוחם חדש"} · ${b.name}</h3>
      <label>שם מלא<input name="name" value="${esc(sol?.name || "")}" required></label>
      <div class="row2"><label>מספר אישי<input name="pn" inputmode="numeric" value="${esc(sol?.pn || "")}" required></label><label>טלפון<input name="phone" value="${esc(sol?.phone || "")}"></label></div>
      ${b.kind === "shift" ? `<label>משמרת<select name="shift">${Object.values(b.shifts).map(sh => opt(sh.id, sh.name, sol ? sol.shift === sh.id : sh.id === "s1")).join("")}</select></label>` : ""}
      ${sol ? `<button type="button" class="btn danger" data-act="del-sol" data-s="${sol.id}">הסרת הלוחם מהסוללה</button>` : ""}`,
      fd => {
        const dup = Object.values(S().batteries).some(x => Object.values(x.soldiers).some(y => y.pn === fd.pn && y.id !== sol?.id)) || Object.values(S().staff).some(x => x.pn === fd.pn);
        if (dup) { toast("מספר אישי כבר קיים במערכת"); return false; }
        const id = sol ? sol.id : b.id + uid("");
        const next = { ...(sol || { id, loc: null, locAt: 0 }), name: fd.name.trim(), pn: fd.pn.trim(), phone: fd.phone.trim() };
        if (b.kind === "shift") next.shift = fd.shift;
        Store.write([[["batteries", b.id, "soldiers", id], next]]); toast("נשמר");
      });
  }
  function textModal(title, label, value, cb) { modal(`<h3>${title}</h3><label>${label}<input name="v" value="${esc(value)}" required></label>`, fd => cb(fd.v.trim())); }

  /* ---------- התרעות קופצות ---------- */
  const notified = new Set(JSON.parse(sessionStorage.getItem("g66-notified") || "[]"));
  function checkPopups() {
    const u = who(); if (!u || u.kind !== "soldier") return;
    const pending = myAlerts().filter(a => !(a.acks || {})[u.id]);
    const fresh = pending.filter(a => !notified.has(a.id));
    if (!fresh.length) return;
    fresh.forEach(a => {
      notified.add(a.id);
      try { if ("Notification" in window && Notification.permission === "granted") new Notification("גדוד 66 · זימון לאימון", { body: `${a.title} · ${Time.dm(a.date)} ${a.time}${a.place ? " · " + a.place : ""}`, icon: "icons/icon-192.png", tag: a.id }); } catch {}
    });
    sessionStorage.setItem("g66-notified", JSON.stringify([...notified]));
    const a = fresh[0]; const p = $("#popup");
    p.innerHTML = `<div class="popup-card"><div class="siren"></div><p class="pp-k">התרעה · זימון לאימון</p>${alertCard(a, u)}<button class="btn ghost" data-act="close-popup">סגור</button></div>`;
    p.hidden = false;
    try { navigator.vibrate && navigator.vibrate([300, 120, 300, 120, 600]); } catch {}
  }

  /* ---------- טוסט ---------- */
  let toastT;
  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 2200); }

  /* ---------- רינדור ---------- */
  function render() {
    const app = $("#app");
    if (me && !who()) { me = null; }
    if (!me) { app.innerHTML = viewLogin(); bindLogin(); return; }
    const u = who(); let html;
    if (u.kind === "soldier") html = route === "schedule" ? viewSchedule() : route === "alerts" ? viewSoldierAlerts() : viewSoldierHome();
    else {
      const valid = navItems().map(n => n[0]); if (!valid.includes(route)) route = valid[0];
      html = { overview: viewOverview, home: viewCmdHome, schedule: viewSchedule, people: viewPeople, teams: viewTeams, summon: viewSummon }[route]();
    }
    const focus = document.activeElement && document.activeElement.dataset.act === "search" ? document.activeElement.selectionStart : null;
    app.innerHTML = shell(html);
    if (focus !== null) { const s = app.querySelector('[data-act="search"]'); s.focus(); s.setSelectionRange(focus, focus); }
    const sf = $("#summonForm"); sf && (sf.onsubmit = sendSummon);
    checkPopups();
  }
  function bindLogin() {
    $("#loginForm").onsubmit = e => { e.preventDefault(); if (login($("#pn").value)) { askNotify(); render(); } else $("#loginErr").textContent = "מספר אישי לא נמצא במערכת"; };
  }
  function askNotify() { try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch {} }
  function sendSummon(e) {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target)); const [type, id] = fd.target.split(":");
    const a = { id: uid("al"), battery: ctx, target: { type, id: id || null }, title: fd.title.trim() || "אימון", date: fd.date, time: fd.time, when: fd.date + "T" + fd.time, place: fd.place.trim(), note: fd.note.trim(), createdBy: who().name, createdAt: Date.now(), acks: {} };
    Store.write([[["alerts", a.id], a]]);
    toast(`הזימון נשלח ל-${alertTargets(a).length} לוחמים`);
  }

  /* ---------- אירועים ---------- */
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-act]"); if (!t || t.tagName === "SELECT" || t.tagName === "INPUT") return;
    const d = t.dataset; const s = S(); const b = s.batteries[ctx]; const u = who();
    switch (d.act) {
      case "demo-login": login(d.pn); askNotify(); render(); break;
      case "logout": logout(); break;
      case "go": route = d.r; ui.swapA = null; render(); scrollTo(0, 0); break;
      case "open-bat": ctx = d.b; route = "home"; render(); scrollTo(0, 0); break;
      case "arrive-shift": { const sb = s.batteries[u.battery]; Store.write([[["batteries", sb.id, "arrivals", d.slot, u.id], Date.now()]]); toast("הגעתך דווחה ✓"); break; }
      case "arrive-loc": Store.write([[["batteries", u.battery, "locArrivals", u.id], { loc: u.loc, at: Date.now() }]]); toast("הגעתך ליעד דווחה ✓"); break;
      case "toggle-arr": { const cur = (b.arrivals?.[d.slot] || {})[d.s]; Store.write([[["batteries", b.id, "arrivals", d.slot, d.s], cur ? undefined : Date.now()]]); break; }
      case "ack": Store.write([[["alerts", d.id, "acks", u.id], Date.now()]]); $("#popup").hidden = true; toast("אישור התקבל"); break;
      case "close-popup": $("#popup").hidden = true; break;
      case "week": ui.week = +d.d === 0 ? 0 : ui.week + +d.d; render(); break;
      case "edit-slot": slotModal(b, b.slots[d.id]); break;
      case "new-slot": slotModal(b, null, d.date); break;
      case "del-slot": if (confirm("למחוק את המשמרת מהשבצ״ק?")) { Store.write([[["batteries", b.id, "slots", d.id], undefined], [["batteries", b.id, "arrivals", d.id], undefined]]); closeModal(); } break;
      case "auto-sched": autoModal(b); break;
      case "close-modal": closeModal(); break;
      case "add-loc": textModal("מיקום חדש", "שם המיקום", "", v => { const id = uid("l"); Store.write([[["batteries", b.id, "locations", id], { id, name: v }]]); }); break;
      case "rename-loc": textModal("שינוי שם מיקום", "שם חדש", b.locations[d.l].name, v => Store.write([[["batteries", b.id, "locations", d.l, "name"], v]])); break;
      case "del-loc": if (confirm(`למחוק את "${b.locations[d.l].name}"? הלוחמים בו יעברו לממתינים לשיבוץ.`)) {
          const ops = Object.values(b.soldiers).filter(x => x.loc === d.l).map(x => [["batteries", b.id, "soldiers", x.id, "loc"], null]);
          ops.push([["batteries", b.id, "locations", d.l], undefined]); Store.write(ops); } break;
      case "swap": {
        if (!ui.swapA) { ui.swapA = d.s; render(); break; }
        if (ui.swapA === d.s) { ui.swapA = null; render(); break; }
        const A = b.soldiers[ui.swapA], B = b.soldiers[d.s];
        if (A.shift === B.shift) { toast("יש לבחור לוחם ממשמרת אחרת"); break; }
        Store.write([[["batteries", b.id, "soldiers", A.id, "shift"], B.shift], [["batteries", b.id, "soldiers", B.id, "shift"], A.shift]]);
        toast(`${A.name} ⇄ ${B.name}`); ui.swapA = null; render(); break;
      }
      case "swap-cancel": ui.swapA = null; render(); break;
      case "add-sol": soldierModal(b, null); break;
      case "edit-sol": soldierModal(b, b.soldiers[d.s]); break;
      case "del-sol": if (confirm("להסיר את הלוחם מהסוללה?")) { const ops = [[["batteries", b.id, "soldiers", d.s], undefined]];
          Object.values(b.teams || {}).forEach(tm => tm.roles.forEach((r, i) => { if (r.sid === d.s) ops.push([["batteries", b.id, "teams", tm.id, "roles", i, "sid"], null]); }));
          Store.write(ops); closeModal(); } break;
      case "add-team": { const id = uid("t"); Store.write([[["batteries", b.id, "teams", id], { id, name: `צוות מיוחד ${Object.keys(b.teams || {}).length + 1}`, roles: Seed.TEAM_ROLES.map(title => ({ title, sid: null })) }]]); break; }
      case "rename-team": textModal("שם הצוות", "שם", b.teams[d.t].name, v => Store.write([[["batteries", b.id, "teams", d.t, "name"], v]])); break;
      case "del-team": if (confirm("למחוק את הצוות?")) Store.write([[["batteries", b.id, "teams", d.t], undefined]]); break;
      case "toggle-alert": ui.openAlert = ui.openAlert === d.id ? null : d.id; render(); break;
      case "del-alert": if (confirm("לבטל את הזימון?")) Store.write([[["alerts", d.id], undefined]]); break;
    }
  });
  document.addEventListener("change", e => {
    const t = e.target; const d = t.dataset; if (!d.act) return; const b = S().batteries[ctx];
    switch (d.act) {
      case "ctx": ctx = t.value; ui.slot = null; render(); break;
      case "pick-slot": ui.slot = t.value; render(); break;
      case "set-shift": Store.write([[["batteries", b.id, "soldiers", d.s, "shift"], t.value]]); toast(`הועבר ל${b.shifts[t.value].name}`); break;
      case "move-loc": Store.write([[["batteries", b.id, "soldiers", d.s, "loc"], t.value || null], [["batteries", b.id, "soldiers", d.s, "locAt"], Date.now()]]); toast(t.value ? `הונחה להגיע ל${b.locations[t.value].name}` : "הוסר משיבוץ"); break;
      case "role-sol": { const team = b.teams[d.t]; const roles = team.roles.map((r, i) => (i === +d.i ? { ...r, sid: t.value || null } : r)); Store.write([[["batteries", b.id, "teams", d.t, "roles"], roles]]); break; }
      case "role-title": { const team = b.teams[d.t]; const roles = team.roles.map((r, i) => (i === +d.i ? { ...r, title: t.value.trim() || r.title } : r)); Store.write([[["batteries", b.id, "teams", d.t, "roles"], roles]]); break; }
    }
  });
  document.addEventListener("input", e => { if (e.target.dataset.act === "search") { ui.search = e.target.value; render(); } });

  /* ---------- אתחול ---------- */
  (async () => {
    await Store.init();
    try { const saved = JSON.parse(localStorage.getItem(SESSION_KEY)); if (saved) { me = saved; const u = who(); if (u) { ctx = u.battery || "a"; route = u.role === "mgd" ? "overview" : "home"; } else me = null; } } catch {}
    Store.sub(() => { if (!$("#modal").hidden) return; render(); });
    render();
    setInterval(() => { if ($("#modal").hidden && document.activeElement?.tagName !== "SELECT" && document.activeElement?.tagName !== "INPUT") render(); }, 60e3);
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
  })();
})();

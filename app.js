// Ядро: хранилище, сохранение, вкладка «Тренировка», таймер умного блока.
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const num = v => { const x = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(x) ? x : null; };
const fmt = x => String(Math.round(x * 10) / 10).replace(".", ",");
const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const WD = ["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];
const longDate = s => { const d = parseYmd(s); return `${WD[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const shortDate = s => { const d = parseYmd(s); return `${d.getDate()}.${pad(d.getMonth() + 1)}`; };
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);

const st = { W: {}, D: {}, M: {}, B: {}, S: { foods: [] }, db: null, today: ymd(new Date()), typed: false, gotW: false, dayView: ymd(new Date()) };

/* ---------- хранилище: облако Телеграма (CloudStorage); вне Телеграма - память браузера ---------- */
// Облако Телеграма: до 1024 ключей по 4096 знаков на одного бота. Запись за день помещается с запасом.
const TG = window.Telegram && Telegram.WebApp;
const CS = TG && TG.initData ? TG.CloudStorage : null;
const COLS = { workouts: "W", days: "D", measures: "M", balance: "B" };
const pending = {}, inflight = {}, timers = {};
const ckey = (col, id) => `${col}_${id}`; // в ключе облака можно только буквы, цифры, _ и -
const csCall = (m, ...a) => new Promise((ok, no) => CS[m](...a, (e, v) => e ? no(e) : ok(v)));
async function putItem(k, v) { if (CS) await csCall("setItem", k, v); else localStorage.setItem("zal_" + k, v); }
async function readAll() {
  const o = {};
  if (!CS) {
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("zal_")) o[k.slice(4)] = localStorage.getItem(k); }
    return o;
  }
  const keys = (await csCall("getKeys")).filter(k => k !== "zalkey");
  for (let i = 0; i < keys.length; i += 50) Object.assign(o, await csCall("getItems", keys.slice(i, i + 50)));
  return o;
}

function banner(text) { const b = $("#banner"); b.textContent = text; b.hidden = !text; }

function save(col, id, data) {
  const key = `${col}/${id}`;
  pending[key] = data;
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => flush(key), 600);
}
async function flush(key) {
  if (inflight[key] || !(key in pending)) return;
  const data = pending[key]; delete pending[key];
  const [col, id] = key.split("/"), txt = JSON.stringify(data);
  if (txt.length > 4096) { banner("Запись за этот день не помещается в облако Телеграма (больше 4096 знаков). Напиши Физруку."); return; }
  inflight[key] = true;
  try { await putItem(ckey(col, id), txt); banner(""); }
  catch (e) { banner("Не получилось сохранить. Проверь интернет: запись сохранится при следующем изменении."); }
  inflight[key] = false;
  if (key in pending) flush(key);
}
const thaw = o => JSON.parse(JSON.stringify(o ?? {}));
const busy = key => key in pending || inflight[key];

async function initDb() {
  let items = {};
  try { items = await readAll(); } catch (e) { banner("Не получилось прочитать записи из облака Телеграма. Закрой и открой приложение."); }
  if (!Object.keys(items).length && typeof HISTORY === "object") {
    // Первый запуск: переносим записи из старого «Моего зала» (выгружены 23.10.2026)
    for (const [col, docs] of Object.entries(HISTORY)) for (const [id, d] of Object.entries(docs)) {
      items[ckey(col, id)] = JSON.stringify(d);
      try { await putItem(ckey(col, id), items[ckey(col, id)]); } catch (e) {}
    }
  }
  for (const [k, v] of Object.entries(items)) {
    const i = k.indexOf("_"), col = k.slice(0, i), id = k.slice(i + 1);
    let d; try { d = JSON.parse(v); } catch (e) { continue; }
    if (COLS[col]) st[COLS[col]][id] = d;
    else if (col === "settings" && id === "main") st.S = { foods: [], ...d };
  }
  st.gotW = true; renderWork(); renderWeek();
}

function onData(col) {
  if (col === "workouts") {
    if (!st.gotW && !st.typed) { st.gotW = true; renderWork(); } else { st.gotW = true; renderWeek(); }
  }
  if (col === "days") { renderWeek(); if (!$("#tab-day").hidden && !st.dayFocus) renderDay(); }
  if (col === "settings" && !$("#tab-day").hidden && !st.dayFocus) renderDay();
  if (!$("#tab-prog").hidden && !st.progFocus) renderProg();
}

/* ---------- тренировка: данные ---------- */
// Зал по кругу А -> Б -> В (В с 19.10.2026); кардио-день (C) в круге не участвует
const GYM = ["A", "B", "V"];
function nextGym() {
  const prev = Object.keys(st.W).filter(d => d < st.today && GYM.includes(st.W[d].type)).sort();
  if (!prev.length) return "A";
  return GYM[(GYM.indexOf(st.W[prev[prev.length - 1]].type) + 1) % GYM.length];
}
function todayType() {
  const w = st.W[st.today]; if (w && w.type) return w.type;
  return PLAN_WEEK[(parseYmd(st.today).getDay() + 6) % 7] === "кар" ? "C" : nextGym();
}
function workout() {
  if (!st.W[st.today]) st.W[st.today] = { date: st.today, type: todayType(), items: {} };
  return st.W[st.today];
}
function itemState(id) { const w = workout(); if (!w.items[id]) w.items[id] = {}; return w.items[id]; }
function saveWorkout() { const w = workout(); w.updatedAt = Date.now(); save("workouts", st.today, w); }

function lastFor(id) {
  const dates = Object.keys(st.W).filter(d => d < st.today).sort().reverse();
  for (const d of dates) {
    const it = st.W[d].items?.[id];
    if (it?.s?.some(x => x && (x.w || x.r || x.d))) return { date: d, s: it.s };
  }
  return null;
}
function lastMin(id) {
  const d = Object.keys(st.W).filter(d => d < st.today && num(st.W[d].items?.[id]?.m) > 0).sort().pop();
  return d ? { date: d, m: st.W[d].items[id].m } : null;
}
function lastText(ex, last) {
  if (!last) return "";
  if (last.m) return `Прошлый раз (${shortDate(last.date)}): ${last.m} мин`;
  const sec = ex.reps === "сек";
  const parts = last.s.filter(x => x && (x.w || x.r)).map(x => sec ? `${x.r || "—"} сек` : (x.w ? `${x.w} кг` : "") + (x.r ? ` × ${x.r}` : ""));
  return parts.length ? `Прошлый раз (${shortDate(last.date)}): ${parts.join(", ")}` : "";
}
function upHint(ex, last) {
  if (!last || !ex.inc || ex.reps === "сек") return "";
  const s = last.s.slice(0, ex.sets);
  if (s.length < ex.sets || !s.every(x => x && x.d && (!x.r || num(x.r) >= ex.reps))) return "";
  const w = Math.max(...s.map(x => num(x.w) || 0)); if (!w) return "";
  return `В прошлый раз все подходы сделаны полностью. Попробуй ${fmt(w + ex.inc)} кг`;
}
function isDone(ex, kind) {
  const it = workout().items[ex.id] || {};
  if (kind === "check") return !!it.d;
  if (kind === "min") return num(it.m) > 0;
  const n = kind === "sets" ? ex.sets : 2;
  return !!it.s && it.s.length >= n && it.s.slice(0, n).every(x => x && x.d);
}

/* ---------- тренировка: отрисовка ---------- */
function photos(ex) {
  if (!ex.img) return `<div class="nophoto">${esc(ex.nophoto)}</div>`;
  const [name, idx] = ex.img, cap = idx.length > 1 ? ["начало", "конец"] : [ex.bad ? "так" : ""];
  const src = f => (typeof FP_IMG === "object" && FP_IMG[f]) || `foto/${f}.jpg`;
  const one = idx.length === 1 && !ex.bad;
  // кадр «как не надо» - рядом с правильным, с красной подписью
  const bad = ex.bad ? `<figure class="bad"><img src="${src(ex.bad[0])}" alt="${esc(ex.n)}, так не надо" loading="lazy"><figcaption>так не надо</figcaption></figure>` : "";
  return `<div class="photos${one ? " one" : ""}${ex.tall ? " tall" : ""}">` + idx.map((k, j) =>
    `<figure><img src="${src(name + "_" + k)}" alt="${esc(ex.n)}${cap[j] ? ", " + cap[j] : ""}" loading="lazy">${cap[j] ? `<figcaption>${cap[j]}</figcaption>` : ""}</figure>`).join("") + bad + `</div>` +
    (ex.bad ? `<div class="warn bad">${esc(ex.bad[1])}</div>` : "");
}
function rows(ex, kind, last) {
  const it = workout().items[ex.id] || {};
  if (kind === "check") return `<button class="btn done" type="button" data-ex="${ex.id}" data-act="check">Сделано</button>`;
  if (kind === "min") return `<div class="set round${num(it.m) > 0 ? " on" : ""}"><span>Минут</span>
    <input id="${ex.id}_m" data-ex="${ex.id}" data-f="m" inputmode="numeric" value="${esc(it.m || "")}" placeholder="${last?.m ? esc(last.m) : "мин"}" aria-label="Сколько минут"><span></span></div>`;
  const n = kind === "sets" ? ex.sets : 2;
  let r = "";
  for (let i = 0; i < n; i++) {
    const s = it.s?.[i] || {}, ls = last?.s?.[i] || {};
    const on = s.d ? " on" : "";
    if (kind === "sets") {
      const sec = ex.reps === "сек", noW = sec || ex.bw;
      const warm = ex.warmFirst && i === 0;
      r += `<div class="set${on}"><span>${warm ? "Разминка" : "Подход " + (i + 1)}</span>
        <input id="${ex.id}_w${i}" data-ex="${ex.id}" data-i="${i}" data-f="w" inputmode="decimal" value="${esc(s.w || "")}" placeholder="${noW ? "—" : warm ? "без блинов" : (ls.w ? esc(ls.w) : "кг")}" ${noW ? "disabled" : ""} aria-label="Вес, подход ${i + 1}">
        <span>×</span>
        <input id="${ex.id}_r${i}" data-ex="${ex.id}" data-i="${i}" data-f="r" inputmode="numeric" value="${esc(s.r || "")}" placeholder="${sec ? "сек" : ex.reps}" aria-label="${sec ? "Секунды" : "Повторы"}, подход ${i + 1}">
        <button class="chk" type="button" data-ex="${ex.id}" data-i="${i}" data-act="set" aria-label="Подход ${i + 1} сделан">✓</button></div>`;
    } else {
      r += `<div class="set round${on}"><span>Круг ${i + 1}</span>${ex.weight
        ? `<input id="${ex.id}_w${i}" data-ex="${ex.id}" data-i="${i}" data-f="w" inputmode="decimal" value="${esc(s.w || "")}" placeholder="${ls.w ? esc(ls.w) : "кг"}" aria-label="Вес, круг ${i + 1}">` : "<span></span>"}
        <button class="chk" type="button" data-ex="${ex.id}" data-i="${i}" data-act="set" aria-label="Круг ${i + 1} сделан">✓</button></div>`;
    }
  }
  return `<div class="sets">${r}</div>`;
}
// Видео тренера. Есть ролик (v.clip) - играет прямо в карточке: файл зашифрован тем же ключом, что data.enc.
// Нет ролика - ссылка на полное видео в Телеграме с нужной минуты. Адрес чата - в зашифрованной части.
function videoBtn(ex) {
  const v = typeof VIDEO === "object" && VIDEO[ex.id];
  if (!v) return "";
  if (v.clip) return `<div class="vbox" id="vbox_${ex.id}"><button class="vbtn" type="button" data-act="video" data-ex="${ex.id}">▶ Видео тренера</button></div>`;
  return `<button class="vbtn" type="button" data-act="video" data-ex="${ex.id}">▶ Видео тренера${v.t ? " с " + Math.floor(v.t / 60) + ":" + pad(v.t % 60) : ""}</button>`;
}
const clipUrls = {};
async function playClip(id) {
  const box = document.getElementById("vbox_" + id);
  if (!box) return;
  box.innerHTML = `<div class="vload">Загружаю видео…</div>`;
  try {
    if (!clipUrls[id]) {
      const r = await fetch(VIDEO[id].clip);
      if (!r.ok) throw new Error("файл не найден (" + r.status + ")");
      const buf = new Uint8Array(await r.arrayBuffer());
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, window.ZALK, buf.slice(12));
      clipUrls[id] = URL.createObjectURL(new Blob([plain], { type: "video/mp4" }));
    }
    box.innerHTML = `<video class="clip" src="${clipUrls[id]}" controls playsinline autoplay></video>`;
  } catch (e) {
    box.innerHTML = `<div class="vload">Видео не открылось: ${esc(String(e && e.message || e))}</div><button class="vbtn" type="button" data-act="video" data-ex="${id}">▶ Попробовать ещё раз</button>`;
  }
}
function openVideo(id) {
  const v = VIDEO[id];
  if (v.clip) return playClip(id);
  const url = `https://t.me/c/${v.chat || (typeof VIDEO_CHAT === "string" ? VIDEO_CHAT : "")}/${v.msg}${v.t ? "?t=" + v.t : ""}`;
  if (TG && TG.openTelegramLink) TG.openTelegramLink(url); else window.open(url, "_blank");
}
function card(ex, kind, k, total) {
  const last = kind === "check" ? null : kind === "min" ? lastMin(ex.id) : lastFor(ex.id);
  const tips = (ex.tips || []).map(t => `<li>${esc(t)}</li>`).join("") + (ex.hip ? `<li class="hip">${esc(ex.hip)}</li>` : "");
  const lt = lastText(ex, last), up = kind === "sets" ? upHint(ex, last) : "";
  return `<section class="card${isDone(ex, kind) ? " finished" : ""}" data-card="${ex.id}" data-kind="${kind}">
    ${photos(ex)}${ex.warn ? `<div class="warn">${esc(ex.warn)}</div>` : ""}
    <div><div class="num">${pad(k + 1)} / ${pad(total)}</div><h3>${esc(ex.n)}</h3><div class="plan">${esc(ex.plan)}</div></div>
    <ul class="tips">${tips}</ul>${videoBtn(ex)}${lt ? `<div class="last">${esc(lt)}</div>` : ""}${up ? `<div class="up">↑ ${esc(up)}</div>` : ""}
    ${rows(ex, kind, last)}</section>`;
}

function weekHtml() {
  const now = parseYmd(st.today), dow = (now.getDay() + 6) % 7;
  let h = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(now.getDate() - dow + i);
    const key = ymd(d), w = st.W[key], a = st.D[key]?.act || {};
    const card = w?.type === "C" || (!w?.type && PLAN_WEEK[i] === "кар");
    const gym = !card && (PLAN_WEEK[i] === "зал" || w?.finished);
    const label = card ? "кар" : gym ? "зал" : a.tennis ? "тен" : a.bike ? "вел" : a.walk ? "ход" : "·";
    const done = card || gym ? !!w?.finished : label !== "·";
    h += `<div class="day${done ? " done" : ""}${key === st.today ? " today" : ""}"><b>${label}</b>${DAY_NAMES[i]}</div>`;
  }
  return h;
}
function renderWeek() { const w = $("#week"); if (w) w.innerHTML = weekHtml(); }

function allItems() { const t = workout().type; return PARTS(t).flatMap(p => p.items.map(ex => [ex, p.kind])); }
function recount() {
  const all = allItems(), done = all.filter(([ex, k]) => isDone(ex, k)).length;
  $("#count").textContent = `${done} из ${all.length}`;
  $("#bar").style.width = (done / all.length * 100) + "%";
}

function renderWork() {
  const w = workout(), t = w.type, L = { A: "А", B: "Б", V: "В" };
  const TITLE = { A: "Тренировка А", B: "Тренировка Б", V: "Тренировка В", C: "Кардио и растяжка" };
  const SUB = { A: "Всё тело, акцент ягодицы", B: "Всё тело, акцент спина",
    V: "Осанка, пресс, ноги", C: "Эллипс, растяжка, осанка" };
  const others = [...GYM.filter(x => x !== t), "C"].filter(x => x !== t);
  const swaps = "Сегодня другая: " + others.map(x => `<button class="link" type="button" data-act="swap" data-to="${x}">${x === "C" ? "кардио" : L[x]}</button>`).join(" · ");
  const parts = PARTS(t).map(p => `<div class="part"><h2>${p.t}</h2><span>${p.time}</span></div>
    ${p.note ? `<div class="partnote">${esc(p.note)}</div>` : ""}
    ${p.timer ? `<button class="timerbtn" type="button" data-act="timer">▶ Запустить таймер блока</button>` : ""}
    ${p.items.map((ex, k) => card(ex, p.kind, k, p.items.length)).join("")}`).join("");
  $("#tab-work").innerHTML = `<div class="wrap">
    <header><div class="date">${longDate(st.today)}</div>
      <h1>${TITLE[t]}</h1>
      <div class="sub">${SUB[t]}</div>
      <div class="sub">${swaps}</div>
      <div class="progress"><div class="bar"><i id="bar"></i></div><span id="count"></span></div></header>
    <div class="week" id="week" aria-label="Неделя">${weekHtml()}</div>
    ${parts}
    <div class="part"><h2>Как прошло</h2><span></span></div>
    <section class="card">
      <div class="q">${typeof HIP_Q === "string" ? HIP_Q : "Самочувствие"}</div>
      <div class="pills" data-pick="hip">${["нормально","ныл","болел"].map(v => `<button type="button" class="pill${w.hip === v ? " sel" : ""}">${v}</button>`).join("")}</div>
      <div class="q">Насколько тяжело</div>
      <div class="pills" data-pick="hard">${["легко","в самый раз","на пределе"].map(v => `<button type="button" class="pill${w.hard === v ? " sel" : ""}">${v}</button>`).join("")}</div>
      <div class="q">Заметка</div>
      <textarea id="w_note" data-f="note" rows="3" placeholder="Например: мост шёл легко, правая нога устала раньше левой">${esc(w.note || "")}</textarea>
      <button class="primary" type="button" data-act="finish">${w.finished ? "Тренировка отмечена ✓" : "Тренировка сделана"}</button>
      <div class="saved" id="fin_msg"></div>
    </section></div>`;
  recount();
}

/* ---------- тренировка: события ---------- */
$("#tab-work").addEventListener("input", e => {
  const el = e.target; st.typed = true;
  if (el.id === "w_note") { workout().note = el.value; saveWorkout(); return; }
  if (!el.dataset.ex) return;
  if (el.dataset.f === "m") {
    const it = itemState(el.dataset.ex); it.m = el.value.trim();
    const on = num(it.m) > 0; el.parentElement.classList.toggle("on", on); el.closest(".card").classList.toggle("finished", on);
    recount(); saveWorkout(); return;
  }
  const it = itemState(el.dataset.ex), i = +el.dataset.i;
  it.s = it.s || []; it.s[i] = { ...(it.s[i] || {}), [el.dataset.f]: el.value.trim() };
  saveWorkout();
});
$("#tab-work").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const act = b.dataset.act;
  if (act === "set") {
    st.typed = true;
    const it = itemState(b.dataset.ex), i = +b.dataset.i;
    it.s = it.s || []; it.s[i] = { ...(it.s[i] || {}), d: !(it.s[i]?.d) };
    b.parentElement.classList.toggle("on", it.s[i].d);
    const c = b.closest(".card"), ex = ALL_EX.find(x => x.id === b.dataset.ex);
    c.classList.toggle("finished", isDone(ex, c.dataset.kind));
    recount(); saveWorkout();
  } else if (act === "check") {
    st.typed = true;
    const it = itemState(b.dataset.ex); it.d = !it.d;
    b.closest(".card").classList.toggle("finished", it.d);
    recount(); saveWorkout();
  } else if (act === "swap") {
    const w = workout(); w.type = b.dataset.to; saveWorkout(); renderWork(); scrollTo(0, 0);
  } else if (act === "finish") {
    const w = workout(); w.finished = true; w.finishedAt = Date.now(); saveWorkout();
    b.textContent = "Тренировка отмечена ✓"; $("#fin_msg").textContent = "Сохранено. Отметка в неделе стоит."; renderWeek();
  } else if (act === "timer") startTimer();
  else if (act === "video") openVideo(b.dataset.ex);
  else if (b.classList.contains("pill")) {
    const g = b.parentElement, w = workout(); st.typed = true;
    g.querySelectorAll(".pill").forEach(x => x.classList.toggle("sel", x === b));
    w[g.dataset.pick] = b.textContent; saveWorkout();
  }
});

/* ---------- таймер умного блока ---------- */
let tm = null;
function beep(f = 880, ms = 180) {
  try { const a = tm.ac, o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; o.connect(g); g.connect(a.destination); g.gain.value = .15; o.start(); o.stop(a.currentTime + ms / 1000); } catch (e) {}
}
function startTimer() {
  const seq = [], last = SMART.length - 1;
  for (let r = 0; r < 2; r++) SMART.forEach((ex, i) => {
    seq.push({ ex, r, ph: "work", len: 40 });
    if (r === 1 && i === last) return;
    const between = i === last; // между кругами отдых дольше
    seq.push({ ex: SMART[between ? 0 : i + 1], r: between ? r + 1 : r, ph: "rest", len: between ? 90 : 20 });
  });
  tm = { seq, i: 0, left: seq[0].len, paused: false, cmd: "", ac: null, lock: null };
  try { tm.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  try { navigator.wakeLock?.request("screen").then(l => tm && (tm.lock = l)).catch(() => {}); } catch (e) {}
  $("#overlay").hidden = false; drawTimer(); beep(660);
  tm.h = setInterval(tick, 1000);
}
function tick() {
  if (!tm || tm.paused) return;
  tm.left--;
  const cur = tm.seq[tm.i];
  if (cur.ph === "work" && cur.ex.id === "s_steps" && tm.left % 2 === 0) { tm.cmd = ["вперёд","назад","вправо","влево"][Math.floor(Math.random() * 4)]; beep(990, 90); }
  if (cur.ph === "work" && tm.left === 20 && ["s_star","s_chop"].includes(cur.ex.id)) { tm.cmd = cur.ex.id === "s_star" ? "смени ногу" : "смени сторону"; beep(740); }
  if (tm.left <= 3 && tm.left > 0) beep(520, 80);
  if (tm.left <= 0) {
    if (cur.ph === "work" && cur.ex.id === SMART[SMART.length - 1].id) markRound(cur.r);
    tm.i++; tm.cmd = "";
    if (tm.i >= tm.seq.length) { stopTimer(true); return; }
    tm.left = tm.seq[tm.i].len; beep(tm.seq[tm.i].ph === "work" ? 880 : 440, 250);
  }
  drawTimer();
}
function markRound(r) {
  SMART.forEach(ex => { const it = itemState(ex.id); it.s = it.s || []; it.s[r] = { ...(it.s[r] || {}), d: true }; });
  saveWorkout();
}
function drawTimer() {
  const cur = tm.seq[tm.i], nxt = tm.seq.slice(tm.i + 1).find(x => x.ph === "work");
  $("#overlay").innerHTML = `<div class="ph">Круг ${cur.r + 1} из 2 · ${cur.ph === "work" ? "работа" : (cur.len === 90 ? "отдых перед вторым кругом" : "переход")}</div>
    <div class="ex">${cur.ph === "rest" ? "Дальше: " : ""}${esc(cur.ex.n)}</div>
    <div class="cnt">${tm.left}</div><div class="cmd">${esc(tm.cmd)}</div>
    <div class="nx">${nxt && cur.ph === "work" ? "Потом: " + esc(nxt.ex.n) : ""}</div>
    <div class="row"><button class="btn" type="button" id="tm_pause">${tm.paused ? "Продолжить" : "Пауза"}</button><button class="btn" type="button" id="tm_stop">Закончить</button></div>`;
  $("#tm_pause").onclick = () => { tm.paused = !tm.paused; drawTimer(); };
  $("#tm_stop").onclick = () => stopTimer(false);
}
function stopTimer(finished) {
  if (!tm) return;
  clearInterval(tm.h); try { tm.lock?.release(); } catch (e) {} try { tm.ac?.close(); } catch (e) {}
  tm = null; $("#overlay").hidden = true; renderWork();
  if (finished) { const b = document.querySelector('[data-act="timer"]'); b?.scrollIntoView({ block: "start" }); }
}

/* ---------- вкладки ---------- */
document.querySelector("nav.tabs").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  document.querySelectorAll("nav.tabs button").forEach(x => x.classList.toggle("on", x === b));
  ["work", "day", "prog"].forEach(t => { $("#tab-" + t).hidden = t !== b.dataset.tab; });
  if (b.dataset.tab === "day") renderDay();
  if (b.dataset.tab === "prog") renderProg();
  if (b.dataset.tab === "work") renderWeek();
  scrollTo(0, 0);
});

function renderAll() { renderWork(); }
if (TG) { TG.ready(); TG.expand(); try { TG.disableVerticalSwipes(); } catch (e) {} }
renderAll();
initDb();

// Вкладки «День» (активность, белок, сон) и «Прогресс» (графики, замеры, тесты на баланс).

/* ---------- день ---------- */
function dayDoc(d) { if (!st.D[d]) st.D[d] = { date: d, act: {}, log: [] }; const x = st.D[d]; x.act = x.act || {}; x.log = x.log || []; return x; }
function saveDay(d) { save("days", d, st.D[d]); }
const proteinOf = d => (st.D[d]?.log || []).reduce((a, x) => a + (num(x.g) || 0), 0);

function renderDay() {
  const d = st.dayView, x = st.D[d] || { act: {}, log: [] }, act = x.act || {};
  const total = proteinOf(d), foods = [...FOODS, ...(st.S.foods || [])];
  $("#tab-day").innerHTML = `<div class="wrap">
    <header><div class="row" style="justify-content:space-between;flex-wrap:nowrap">
      <button class="btn" type="button" data-dact="prev" aria-label="Предыдущий день" style="flex:0 0 auto">‹</button>
      <div style="text-align:center;flex:1"><div class="date">${d === st.today ? "Сегодня" : "Запись за день"}</div><h1 style="font-size:20px">${longDate(d)}</h1></div>
      <button class="btn" type="button" data-dact="next" aria-label="Следующий день" style="flex:0 0 auto" ${d >= st.today ? "disabled" : ""}>›</button></div></header>

    <div class="part"><h2>Движение</h2><span></span></div>
    <section class="card"><h3>Ходьба</h3><div class="row">
      <label class="muted">Километры<input id="wk_km" inputmode="decimal" value="${esc(x.walkKm || "")}" placeholder="5,2"></label>
      <label class="muted">Минуты<input id="wk_min" inputmode="numeric" value="${esc(x.walkMin || "")}" placeholder="60"></label>
    </div><div class="saved" id="wk_msg"></div></section>
    <div class="toggles" style="grid-template-columns:repeat(2,minmax(0,1fr))">${[["tennis","Теннис"],["bike","Велосипед"]].map(([k, n]) =>
      `<button type="button" class="toggle${act[k] ? " on" : ""}" data-act-k="${k}">${act[k] ? "✓ " : ""}${n}</button>`).join("")}</div>

    <div class="part"><h2>Белок</h2><span>цель ${PROTEIN_GOAL[0]}-${PROTEIN_GOAL[1]} г</span></div>
    <section class="card">
      <div class="row" style="align-items:baseline;flex-wrap:nowrap"><div class="big" style="flex:0 0 auto">${fmt(total)} г</div>
        <div class="muted" style="flex:1">${total >= PROTEIN_GOAL[0] ? "Цель на день есть" : `До цели ещё ${fmt(PROTEIN_GOAL[0] - total)} г`}</div></div>
      <div class="bar"><i style="width:${Math.min(100, total / PROTEIN_GOAL[1] * 100)}%;${total >= PROTEIN_GOAL[0] ? "background:var(--ok)" : ""}"></i></div>
      <div class="q">Нажми, что съела</div>
      <div class="pills">${foods.map((f, i) => `<button type="button" class="pill" data-food="${i}">${esc(f.n)} +${fmt(f.g)}</button>`).join("")}</div>
      <div class="q">Своё</div>
      <div class="row"><input id="f_name" placeholder="Что съела" aria-label="Название"><input id="f_g" inputmode="decimal" placeholder="Белок, г" aria-label="Граммы белка" style="flex:0 1 100px"></div>
      <label class="muted"><input type="checkbox" id="f_keep" style="width:auto"> Запомнить как кнопку</label>
      <button class="btn" type="button" data-dact="add">Добавить</button>
      <div class="log">${x.log.map((it, i) => `<div><span>${esc(it.n)}</span><span>${fmt(num(it.g) || 0)} г <button type="button" class="x" data-del="${i}" aria-label="Убрать">×</button></span></div>`).join("") || `<span class="muted">Пока ничего не записано</span>`}</div>
      ${(st.S.foods || []).length ? `<button class="link" type="button" data-dact="forget">Убрать свои кнопки</button>` : ""}
    </section>

    <div class="part"><h2>Сон</h2><span>из Sleep Cycle</span></div>
    <section class="card"><div class="row">
      <label class="muted">Спала, часов<input id="s_h" inputmode="decimal" value="${esc(x.sleepH || "")}" placeholder="7,5"></label>
      <label class="muted">Качество, %<input id="s_q" inputmode="numeric" value="${esc(x.sleepQ || "")}" placeholder="80"></label>
    </div><div class="saved" id="s_msg"></div></section>
  </div>`;
}

$("#tab-day").addEventListener("focusin", () => { st.dayFocus = true; });
$("#tab-day").addEventListener("focusout", () => { st.dayFocus = false; });
$("#tab-day").addEventListener("input", e => {
  const id = e.target.id, d = st.dayView;
  if (id === "wk_km" || id === "wk_min") {
    const x = dayDoc(d); x[id === "wk_km" ? "walkKm" : "walkMin"] = e.target.value.trim();
    x.act.walk = !!(num(x.walkKm) || num(x.walkMin)); saveDay(d); renderWeek();
    $("#wk_msg").textContent = "Сохраняется";
    clearTimeout(st.wMsg); st.wMsg = setTimeout(() => { const m = $("#wk_msg"); if (m) m.textContent = "Сохранено"; }, 900);
    return;
  }
  if (id !== "s_h" && id !== "s_q") return;
  const x = dayDoc(d); x[id === "s_h" ? "sleepH" : "sleepQ"] = e.target.value.trim(); saveDay(d);
  $("#s_msg").textContent = "Сохраняется";
  clearTimeout(st.sMsg); st.sMsg = setTimeout(() => { const m = $("#s_msg"); if (m) m.textContent = "Сохранено"; }, 900);
});
$("#tab-day").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const d = st.dayView;
  if (b.dataset.dact === "prev" || b.dataset.dact === "next") {
    const t = parseYmd(d); t.setDate(t.getDate() + (b.dataset.dact === "prev" ? -1 : 1));
    st.dayView = ymd(t) > st.today ? st.today : ymd(t); st.dayFocus = false; renderDay(); return;
  }
  if (b.dataset.actK) { const x = dayDoc(d); x.act[b.dataset.actK] = !x.act[b.dataset.actK]; saveDay(d); st.dayFocus = false; renderDay(); renderWeek(); return; }
  if (b.dataset.food !== undefined) {
    const f = [...FOODS, ...(st.S.foods || [])][+b.dataset.food];
    const x = dayDoc(d); x.log.push({ n: f.n, g: f.g }); saveDay(d); st.dayFocus = false; renderDay(); return;
  }
  if (b.dataset.del !== undefined) { const x = dayDoc(d); x.log.splice(+b.dataset.del, 1); saveDay(d); st.dayFocus = false; renderDay(); return; }
  if (b.dataset.dact === "add") {
    const n = $("#f_name").value.trim() || "Своё", g = num($("#f_g").value);
    if (g === null || g <= 0) { $("#f_g").focus(); $("#f_g").placeholder = "Впиши граммы"; return; }
    const x = dayDoc(d); x.log.push({ n, g }); saveDay(d);
    if ($("#f_keep").checked) { st.S = { ...st.S, foods: [...(st.S.foods || []), { n, g }] }; save("settings", "main", st.S); }
    st.dayFocus = false; renderDay(); return;
  }
  if (b.dataset.dact === "forget") { st.S = { ...st.S, foods: [] }; save("settings", "main", st.S); renderDay(); }
});

/* ---------- графики ---------- */
function chart(pts, opt = {}) {
  if (!pts.length) return `<div class="muted">Пока нет записей</div>`;
  const W = 320, H = 150, L = 34, R = 14, T = 14, B = 24;
  const xs = pts.map(p => parseYmd(p.d).getTime()), ys = pts.map(p => p.y);
  let y0 = Math.min(...ys, opt.goal ?? Infinity), y1 = Math.max(...ys, opt.goal ?? -Infinity);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const padY = (y1 - y0) * .15; y0 = Math.max(0, y0 - padY); y1 += padY;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = t => x1 === x0 ? (L + W - R) / 2 : L + (t - x0) / (x1 - x0) * (W - L - R);
  const Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${X(xs[i]).toFixed(1)},${Y(p.y).toFixed(1)}`).join("");
  const area = pts.length > 1 ? `${path}L${X(xs[xs.length - 1]).toFixed(1)},${H - B}L${X(xs[0]).toFixed(1)},${H - B}Z` : "";
  const ticks = [y0, (y0 + y1) / 2, y1].map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${L - 4}" y="${Y(v) + 4}" text-anchor="end">${fmt(Math.round(v))}</text>`).join("");
  const lp = pts[pts.length - 1], lx = X(xs[xs.length - 1]), ly = Y(lp.y);
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.label || "")}">
    ${ticks}${opt.goal != null ? `<line class="goal" x1="${L}" x2="${W - R}" y1="${Y(opt.goal)}" y2="${Y(opt.goal)}"/>` : ""}
    ${area ? `<path class="ar" d="${area}"/>` : ""}<path class="ln" d="${path}"/>
    ${pts.map((p, i) => `<circle class="pt" cx="${X(xs[i])}" cy="${Y(p.y)}" r="${i === pts.length - 1 ? 4.5 : 2.5}"/>`).join("")}
    <text class="lbl" x="${Math.min(lx, W - R - 2)}" y="${ly - 9}" text-anchor="end">${fmt(lp.y)}${opt.unit ? " " + opt.unit : ""}</text>
    <text class="ax" x="${L}" y="${H - 6}">${shortDate(pts[0].d)}</text>${pts.length > 1 ? `<text class="ax" x="${W - R}" y="${H - 6}" text-anchor="end">${shortDate(lp.d)}</text>` : ""}
  </svg></div>`;
}

/* ---------- прогресс ---------- */
function liftPoints(id) {
  return Object.keys(st.W).sort().map(d => {
    const s = st.W[d].items?.[id]?.s || [], w = Math.max(0, ...s.map(x => num(x?.w) || 0));
    return w ? { d, y: w } : null;
  }).filter(Boolean);
}
const weekSum = (k, from) => Object.keys(st.D).filter(d => d >= from && d <= st.today).reduce((a, d) => a + (num(st.D[d][k]) || 0), 0);
function sw() { return `<button class="btn" type="button" data-sw>Секундомер</button>`; }

function renderProg() {
  const fin = Object.values(st.W).filter(w => w.finished);
  const now = parseYmd(st.today), dow = (now.getDay() + 6) % 7, mon = new Date(now); mon.setDate(now.getDate() - dow);
  const thisWeek = fin.filter(w => w.date >= ymd(mon)).length;
  const lifts = MAIN_LIFTS.map(id => ALL_EX.find(x => x.id === id));
  const prot = Object.keys(st.D).sort().map(d => ({ d, y: proteinOf(d) })).filter(p => p.y > 0);
  const sleepH = Object.keys(st.D).sort().map(d => ({ d, y: num(st.D[d].sleepH) })).filter(p => p.y);
  const sleepQ = Object.keys(st.D).sort().map(d => ({ d, y: num(st.D[d].sleepQ) })).filter(p => p.y);
  const mDates = Object.keys(st.M).sort(), lastM = mDates[mDates.length - 1];
  const bDates = Object.keys(st.B).sort(), lastB = bDates[bDates.length - 1];
  const mPts = k => mDates.map(d => ({ d, y: num(st.M[d][k]) })).filter(p => p.y);
  const due = (last, every, what) => !last ? `Первый ${what} - сегодня` : (daysBetween(last, st.today) >= every ? `Пора: прошлый ${what} ${daysBetween(last, st.today)} дн. назад` : `Следующий ${what} через ${every - daysBetween(last, st.today)} дн.`);
  const tm = st.M[st.today] || {}, tb = st.B[st.today] || {};

  $("#tab-prog").innerHTML = `<div class="wrap">
    <header><div class="date">Прогресс</div><h1>Как идут дела</h1>
      <div class="sub">Тренировок сделано: ${fin.length}. На этой неделе: ${thisWeek} из 3</div></header>

    <div class="part"><h2>Веса</h2><span>самый большой вес за тренировку</span></div>
    ${lifts.map(ex => `<section class="card"><h3>${esc(ex.n)}</h3>${chart(liftPoints(ex.id), { unit: "кг", label: ex.n })}</section>`).join("")}

    <div class="part"><h2>Замеры</h2><span>раз в 2 недели</span></div>
    <section class="card">
      <div class="muted">${due(lastM, 14, "замер")}. Утром, до еды, сантиметр по самому узкому месту талии и самому широкому месту бёдер.</div>
      <div class="row">
        <label class="muted">Талия, см<input id="m_waist" inputmode="decimal" value="${esc(tm.waist || "")}"></label>
        <label class="muted">Бёдра, см<input id="m_hips" inputmode="decimal" value="${esc(tm.hips || "")}"></label>
        <label class="muted">Вес, кг<input id="m_weight" inputmode="decimal" placeholder="можно пусто" value="${esc(tm.weight || "")}"></label>
      </div>
      <button class="btn" type="button" data-pact="measure">Сохранить замер</button><div class="saved" id="m_msg"></div>
      <h3>Талия</h3>${chart(mPts("waist"), { unit: "см", label: "Талия" })}
      <h3>Бёдра</h3>${chart(mPts("hips"), { unit: "см", label: "Бёдра" })}
      ${mPts("weight").length ? `<h3>Вес</h3>${chart(mPts("weight"), { unit: "кг", label: "Вес" })}` : ""}
    </section>

    <div class="part"><h2>Тесты на баланс</h2><span>раз в месяц</span></div>
    <section class="card">
      <div class="muted">${due(lastB, 28, "тест")}. ${typeof BALANCE_NOTE === "string" ? BALANCE_NOTE : ""}</div>
      ${BALANCE_TESTS.map(t => `<div class="test"><span>${esc(t.n)}<br><span class="muted">норма ${t.norm} сек</span></span>
        <input id="b_${t.k}" inputmode="numeric" placeholder="сек" value="${esc(tb[t.k] || "")}" aria-label="${esc(t.n)}, секунды">${sw()}</div>`).join("")}
      <button class="btn" type="button" data-pact="balance">Сохранить тесты</button><div class="saved" id="b_msg"></div>
      ${bDates.length ? `<div style="overflow-x:auto"><table><tr><th>Дата</th>${BALANCE_TESTS.map((t, i) => `<th>Тест ${i + 1}</th>`).join("")}</tr>
        ${bDates.slice().reverse().map(d => `<tr><td>${shortDate(d)}</td>${BALANCE_TESTS.map(t => { const v = num(st.B[d][t.k]); return `<td class="${v == null ? "" : v >= t.norm ? "good" : "low"}">${v == null ? "—" : fmt(v)}</td>`; }).join("")}</tr>`).join("")}</table></div>` : ""}
    </section>

    <div class="part"><h2>Ходьба</h2><span>километры за день</span></div>
    <section class="card"><div class="muted">На этой неделе: ${fmt(weekSum("walkKm", ymd(mon)))} км, ${fmt(weekSum("walkMin", ymd(mon)))} мин</div>
      ${chart(Object.keys(st.D).sort().map(d => ({ d, y: num(st.D[d].walkKm) })).filter(p => p.y), { unit: "км", label: "Ходьба, км" })}</section>

    <div class="part"><h2>Белок</h2><span>граммы за день</span></div>
    <section class="card">${chart(prot, { unit: "г", goal: PROTEIN_GOAL[0], label: "Белок по дням" })}<div class="muted">Пунктир - цель ${PROTEIN_GOAL[0]} г</div></section>

    <div class="part"><h2>Сон</h2><span>из Sleep Cycle</span></div>
    <section class="card"><h3>Часы</h3>${chart(sleepH, { unit: "ч", label: "Сон, часы" })}<h3>Качество</h3>${chart(sleepQ, { unit: "%", label: "Качество сна" })}</section>
  </div>`;
}

$("#tab-prog").addEventListener("focusin", () => { st.progFocus = true; });
$("#tab-prog").addEventListener("focusout", () => { st.progFocus = false; });
$("#tab-prog").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.sw !== undefined) {
    const inp = b.previousElementSibling;
    if (b._t) { clearInterval(b._t); b._t = null; b.textContent = "Секундомер"; return; }
    const t0 = Date.now(); inp.value = "0"; b.textContent = "Стоп";
    b._t = setInterval(() => { inp.value = String(Math.floor((Date.now() - t0) / 1000)); }, 250);
    return;
  }
  if (b.dataset.pact === "measure") {
    const v = { date: st.today, waist: $("#m_waist").value.trim(), hips: $("#m_hips").value.trim(), weight: $("#m_weight").value.trim() };
    if (!num(v.waist) && !num(v.hips) && !num(v.weight)) { $("#m_msg").textContent = "Впиши хотя бы одно число"; return; }
    st.M = { ...st.M, [st.today]: v }; save("measures", st.today, v); st.progFocus = false; renderProg(); $("#m_msg").textContent = "Замер сохранён";
  }
  if (b.dataset.pact === "balance") {
    const v = { date: st.today }; BALANCE_TESTS.forEach(t => { v[t.k] = $("#b_" + t.k).value.trim(); });
    if (!BALANCE_TESTS.some(t => num(v[t.k]) != null)) { $("#b_msg").textContent = "Впиши хотя бы один тест"; return; }
    st.B = { ...st.B, [st.today]: v }; save("balance", st.today, v); st.progFocus = false; renderProg(); $("#b_msg").textContent = "Тесты сохранены";
  }
});

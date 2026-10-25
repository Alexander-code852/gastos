import { CATS, CAT, MEDIOS, MEDIO, parseMonto, parteCuota, movimientosDelMes, resumen, leerBackup, aCSV,
  estadoPresupuesto, avisoPresupuesto, porDia, fijosPendientes, ultimoMesInicial,
  serieMensual, compararCategorias, escalaY, frecuentes, buscar, leerIPC, aPesosDe, repetirIngresos } from "./logic.js";

const KEYS = { gastos: "gastos.v1", presupuestos: "gastos.presupuestos", fijos: "gastos.fijos", ingresos: "gastos.ingresos" };
const BACKUP_KEY = "gastos.ultimaCopia", TAB_KEY = "gastos.tab", RANGO_KEY = "gastos.rango", AJUSTE_KEY = "gastos.ajuste", IPC_KEY = "gastos.ipc";
const IPC_URL = "https://api.argentinadatos.com/v1/finanzas/indices/inflacion";
const TABS = ["gastos", "presupuestos", "meses", "fijos", "copia"];
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const fmt = n => money.format(n);
const plainFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const inputFmt = n => plainFmt.format(n); // "150.000" or "1.500,5", both read back by parseMonto
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const monthFmt = { format: d => cap(new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(d)) };
const dayFmt = { format: d => cap(new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short" }).format(d)) };
const $ = id => document.getElementById(id);
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = () => iso(new Date());
const ESTADO = { bien: "Vas bien", cerca: "Cerca del límite", pasado: "Te pasaste" };

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
// shortcut: everything lives in localStorage (~5 MB, tens of thousands of expenses); move to IndexedDB if it ever gets close.
const S = {
  gastos: read(KEYS.gastos, []),
  presupuestos: { cat: {}, ...read(KEYS.presupuestos, {}) },
  fijos: read(KEYS.fijos, []),
  ingresos: read(KEYS.ingresos, []),
};
let view = (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();
let tab = (() => { try { return localStorage.getItem(TAB_KEY) || "gastos"; } catch { return "gastos"; } })();
const ym = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
let cat = "kiosco", medio = "efectivo", editingId = null, editingFijo = null, editingIngreso = null, undoState = null, toastTimer = 0;

// Writes every changed key first and only then swaps memory; if any write fails, the earlier ones are rolled back.
function commit(changes) {
  const old = {};
  try {
    for (const [k, v] of Object.entries(changes)) {
      old[k] = localStorage.getItem(KEYS[k]);
      localStorage.setItem(KEYS[k], JSON.stringify(v));
    }
  } catch {
    for (const [k, s] of Object.entries(old)) {
      try { s == null ? localStorage.removeItem(KEYS[k]) : localStorage.setItem(KEYS[k], s); } catch {}
    }
    say("No se pudo guardar en el teléfono. Liberá espacio y probá de nuevo.", "err");
    return false;
  }
  Object.assign(S, changes);
  render();
  return true;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const calm = matchMedia("(prefers-reduced-motion: reduce)");
// Rolls a money figure from what it showed before to the new value.
function countTo(node, v, f = fmt) {
  const from = node._v ?? 0, live = node.closest("[aria-live]");
  node._v = v;
  cancelAnimationFrame(node._raf);
  if (calm.matches || from === v) { node.textContent = f(v); live?.removeAttribute("aria-busy"); return; }
  live?.setAttribute("aria-busy", "true"); // screen readers hear the final figure, not every frame
  const t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / 650);
    node.textContent = f(k < 1 ? Math.round(from + (v - from) * (1 - (1 - k) ** 3)) : v);
    if (k < 1) node._raf = requestAnimationFrame(step); else live?.removeAttribute("aria-busy");
  };
  node._raf = requestAnimationFrame(step);
}

function say(text, kind = "", undo = null) {
  $("toastTxt").textContent = text;
  $("toast").className = kind;
  $("undo").hidden = !undo;
  undoState = undo;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $("toast").hidden = true; undoState = null; }, kind ? 7000 : 4500);
}

$("undo").onclick = () => {
  if (!undoState) return;
  $("toast").hidden = true;
  commit(undoState);
  undoState = null;
};

/* ---------- tabs ---------- */

function showTab(name) {
  tab = name;
  try { localStorage.setItem(TAB_KEY, name); } catch {}
  for (const s of document.querySelectorAll(".tab")) s.hidden = s.dataset.tab !== name;
  for (const b of document.querySelectorAll(".tabbar button")) b.setAttribute("aria-current", String(b.dataset.go === name));
  render();
  window.scrollTo(0, 0);
}
for (const b of document.querySelectorAll(".tabbar button")) b.onclick = () => showTab(b.dataset.go);

/* ---------- shared bits ---------- */

function chips(box, items, selected, onPick, dotFor) {
  box.replaceChildren(...items.map(([id, label]) => {
    const b = el("button", "chip", label);
    b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(id === selected));
    if (dotFor?.(id)) { const d = el("span", "dot"); d.setAttribute("aria-hidden", "true"); b.append(d); }
    b.onclick = () => onPick(id);
    return b;
  }));
}

function bars(box, rows, label, isAnt, onPick) {
  const max = rows.length ? rows[0][1] : 1;
  box.replaceChildren(...(rows.length ? rows.map(([id, v]) => {
    const r = el(onPick ? "button" : "div", "bar" + (isAnt?.(id) ? " ant" : ""));
    if (onPick) { r.type = "button"; r.onclick = () => onPick(id); r.setAttribute("aria-label", `${label(id)}: ${fmt(v)}. Ver detalle`); }
    const track = el("div", "track"), fill = el("div", "fill");
    fill.style.width = `${Math.max(2, v / max * 100)}%`;
    track.append(fill);
    r.append(el("span", null, label(id)), el("span", "num", fmt(v)), track);
    return r;
  }) : [el("p", "empty", "Sin gastos todavía.")]));
}

// Progress block for one budget: bar, status pill and what is left.
function budgetBlock(box, e, withPerDay) {
  box.hidden = !e;
  if (!e) return;
  const track = el("div", "track"), fill = el("div", "fill");
  fill.style.width = `${Math.min(100, e.pct * 100)}%`;
  track.append(fill);
  const line = el("div", "budget-line");
  line.append(el("span", "pill " + e.estado, ESTADO[e.estado]));
  let txt = e.queda >= 0 ? `Te quedan ${fmt(e.queda)} de ${fmt(e.limite)}` : `${fmt(-e.queda)} más que tu límite de ${fmt(e.limite)}`;
  const pd = withPerDay ? porDia(e.queda, view.y, view.m) : null;
  if (pd) txt += ` · ${fmt(pd)} por día`;
  line.append(el("span", "sub", txt));
  box.className = "budget " + e.estado;
  box.replaceChildren(track, line);
}

const totalesDelMes = (gastos, y, m) => {
  const r = resumen(movimientosDelMes(gastos, y, m), y, m);
  return { total: r.total, hormiga: r.hormiga, cat: Object.fromEntries(r.porCat) };
};

/* ---------- Gastos ---------- */

function renderForm() {
  chips($("cats"), CATS, cat, id => { cat = id; $("esHormiga").checked = CAT[id].h; renderForm(); }, id => CAT[id].h);
  chips($("medios"), MEDIOS, medio, id => { medio = id; if (id !== "credito") $("cuotas").value = "1"; renderForm(); });
  $("cuotasRow").hidden = medio !== "credito";
  const n = Number($("cuotas").value), monto = parseMonto($("monto").value);
  $("cuotaInfo").textContent = n > 1 && monto > 0 ? `${n} cuotas de ${fmt(parteCuota(monto, n, 0))}` : "";
}

function renderGastos(movs, r) {
  countTo($("total"), r.total);
  $("total").style.setProperty("--n", fmt(r.total).length);
  countTo($("hTotal"), r.hormiga);
  $("hPct").textContent = r.total ? `${Math.round(r.hormiga / r.total * 100)}% del total` : "";
  budgetBlock($("budgetTotal"), estadoPresupuesto(r.total, S.presupuestos.total), true);
  budgetBlock($("budgetHormiga"), estadoPresupuesto(r.hormiga, S.presupuestos.hormiga), false);
  const proy = $("proy");
  proy.replaceChildren();
  if (r.proyeccionAnual) proy.append(r.isCurrent ? "A este ritmo, tus gastos hormiga suman " : "A ese ritmo, los gastos hormiga sumarían ",
    el("strong", null, fmt(r.proyeccionAnual)), " al año.");

  renderIngresos(r.total);

  bars($("porCat"), r.porCat, id => CAT[id]?.label ?? id, id => CAT[id]?.h, abrirCategoria);
  bars($("porMedio"), r.porMedio, id => MEDIO[id] ?? id);

  const byDay = {};
  for (const g of movs) (byDay[g.fecha] ||= []).push(g);
  const dias = Object.keys(byDay).sort().reverse();
  $("lista").replaceChildren(...(dias.length ? dias.map(f => {
    const items = byDay[f].sort((a, b) => b.ts - a.ts);
    const box = el("div", "dia");
    const h = el("div", "dia-h");
    h.append(el("span", null, dayFmt.format(new Date(f + "T12:00"))), el("span", "num", fmt(items.reduce((s, g) => s + g.monto, 0))));
    box.append(h, ...items.map(g => itemRow(g)));
    return box;
  }) : [el("p", "empty", `No hay gastos en ${$("mes").textContent.toLowerCase()}. Cargá el primero arriba.`)]));
  renderBusqueda();
  renderRapidos();

  const last = Number(localStorage.getItem(BACKUP_KEY)) || 0;
  const diasSinCopia = (Date.now() - last) / 864e5;
  $("banner").hidden = !S.gastos.length || diasSinCopia < 14;
  $("bannerTxt").textContent = last ? `Hace ${Math.floor(diasSinCopia)} días que no guardás una copia.` : "Todavía no guardaste una copia de tus datos.";
}

// One expense in a list; search results also show its date and, for installment purchases, the total.
function itemRow(g, conFecha = false) {
  const row = el("div", "item" + (Date.now() - g.ts < 1500 ? " nuevo" : ""));
  const edit = el("button", "edit");
  edit.type = "button";
  const what = el("span", "what");
  what.append(el("span", "cat", CAT[g.cat]?.label ?? g.cat));
  if (g.hormiga) what.append(el("span", "tag", "hormiga"));
  if (g.fijoId) what.append(el("span", "tag tag-fijo", "fijo"));
  const cuotas = g.cuota ? `cuota ${g.cuota}/${g.cuotas}` : conFecha && g.cuotas > 1 ? `${g.cuotas} cuotas` : "";
  const meta = [conFecha ? dayFmt.format(new Date(g.fecha + "T12:00")) : "", MEDIO[g.medio], cuotas, g.nota].filter(Boolean).join(" · ");
  if (meta) what.append(el("span", "meta", meta));
  edit.append(what, el("span", "num", fmt(g.monto)));
  edit.setAttribute("aria-label", `Editar ${CAT[g.cat]?.label ?? g.cat} ${fmt(g.monto)}`);
  edit.onclick = () => startEdit(g.id);
  const del = el("button", "del", "Borrar");
  del.type = "button"; del.setAttribute("aria-label", `Borrar ${CAT[g.cat]?.label ?? g.cat} ${fmt(g.monto)}`);
  del.onclick = () => borrar(g.id);
  row.append(edit, del);
  swipeable(row, () => borrar(g.id));
  return row;
}

// Mail-style rows: drag left to uncover Borrar, past half the width deletes. A drag never opens the editor.
let abierta = null;
function swipeable(row, onDelete) {
  const face = row.querySelector(".edit"), del = row.querySelector(".del"), W = 88;
  let x0 = 0, y0 = 0, dx = 0, modo = null; // "x" or "y" once the gesture's direction is known
  const set = v => { face.style.transform = v ? `translateX(${v}px)` : ""; };
  const abrir = () => { if (abierta && abierta !== row) abierta._cerrar(); set(-W); row.classList.add("open"); abierta = row; };
  const cerrar = row._cerrar = () => { set(0); row.classList.remove("open"); if (abierta === row) abierta = null; };
  row.addEventListener("pointerdown", e => {
    if (e.button || e.target === del) return;
    if (abierta && abierta !== row) abierta._cerrar();
    x0 = e.clientX; y0 = e.clientY; dx = 0; modo = null;
  });
  row.addEventListener("pointermove", e => {
    if (modo === "y" || !e.buttons && e.pointerType === "mouse") return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!modo) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      modo = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (modo === "y") return;
      row.classList.add("drag");
      try { row.setPointerCapture(e.pointerId); } catch {} // throws if the pointer already ended
    }
    dx = Math.min(0, (row.classList.contains("open") ? -W : 0) + mx);
    set(dx);
  });
  const fin = () => {
    if (modo !== "x") return;
    row.classList.remove("drag");
    if (-dx > row.offsetWidth / 2) {
      row.classList.add("open");
      set(-row.offsetWidth);
      setTimeout(() => { onDelete(); if (row.isConnected) cerrar(); }, calm.matches ? 0 : 180);
    } else if (-dx > W / 2) abrir();
    else cerrar();
  };
  row.addEventListener("pointerup", fin);
  row.addEventListener("pointercancel", fin);
  // The click that ends a drag, or a tap on an open row, only closes it.
  row.addEventListener("click", e => {
    if (e.target === del) return;
    if (modo === "x" || row.classList.contains("open")) {
      e.stopPropagation(); e.preventDefault();
      if (modo !== "x") cerrar();
      modo = null;
    }
  }, true);
  del.addEventListener("focus", abrir);
  del.addEventListener("blur", () => { if (!row.matches(":hover")) cerrar(); });
}
document.addEventListener("pointerdown", e => { if (abierta && !abierta.contains(e.target)) abierta._cerrar(); });

// Search runs over every month, grouped by month with the total found.
function renderBusqueda() {
  const q = $("buscar").value.trim();
  $("lista").hidden = !!q;
  $("resultados").hidden = !q;
  if (!q) return;
  const res = buscar(S.gastos, q);
  if (!res.length) { $("resultados").replaceChildren(el("p", "empty", `No hay gastos que coincidan con "${q}".`)); return; }
  const porMes = {};
  for (const g of res) (porMes[g.fecha.slice(0, 7)] ||= []).push(g);
  const total = el("p", "res-total");
  total.append(res.length === 1 ? "1 gasto · " : `${res.length} gastos · `, el("strong", "num", fmt(res.reduce((s, g) => s + g.monto, 0))));
  $("resultados").replaceChildren(total, ...Object.entries(porMes).map(([ym, gs]) => {
    const box = el("div", "dia"), h = el("div", "dia-h");
    h.append(el("span", null, monthFmt.format(new Date(ym + "-15T12:00"))), el("span", "num", fmt(gs.reduce((s, g) => s + g.monto, 0))));
    box.append(h, ...gs.map(g => itemRow(g, true)));
    return box;
  }));
}
$("buscar").addEventListener("input", renderBusqueda);

function renderRapidos() {
  const fr = frecuentes(S.gastos, new Date());
  $("rapidos").hidden = !fr.length;
  $("rapidosBtns").replaceChildren(...fr.map(f => {
    const b = el("button", "rapido"), label = CAT[f.cat]?.label ?? f.cat, monto = fmt(f.monto).replace(/,00$/, "");
    b.type = "button";
    b.append(el("span", "r-cat", label), el("span", "r-monto num", monto), el("span", "r-medio", MEDIO[f.medio] ?? f.medio));
    b.setAttribute("aria-label", `Cargar ${label} ${monto} con ${MEDIO[f.medio] ?? f.medio}, con fecha de hoy`);
    b.onclick = () => guardarGasto({ monto: f.monto, cat: f.cat, medio: f.medio, cuotas: 1, nota: "", fecha: today(), hormiga: f.hormiga },
      null, { gastos: S.gastos });
    return b;
  }));
}

/* ---------- Ingresos ---------- */

const fechaIngresoDefault = () => ym(view.y, view.m) === today().slice(0, 7) ? today() : `${ym(view.y, view.m)}-01`;

function renderIngresos(gastado) {
  const k = ym(view.y, view.m);
  const delMes = S.ingresos.filter(x => x.fecha.startsWith(k)).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.ts - a.ts);
  const total = delMes.reduce((s, x) => s + x.monto, 0);
  $("saldo").hidden = !delMes.length;
  if (delMes.length) {
    const queda = Math.round((total - gastado) * 100) / 100;
    // whole pesos, sized by length in CSS: two figures share the card's width
    for (const [id, v] of [["ingTotal", total], ["queda", Math.abs(queda)]]) {
      countTo($(id), v, pesos);
      $(id).style.setProperty("--n", pesos(v).length);
    }
    $("quedaLbl").textContent = queda >= 0 ? "Te queda" : "Gastaste de más";
    $("saldo").classList.toggle("neg", queda < 0);
  }
  $("ingMes").textContent = delMes.length ? fmt(total) : "";
  $("ingLista").replaceChildren(...delMes.map(x => {
    const row = el("div", "item" + (Date.now() - x.ts < 1500 ? " nuevo" : ""));
    const edit = el("button", "edit");
    edit.type = "button";
    const what = el("span", "what");
    what.append(el("span", "cat", x.concepto), el("span", "meta", dayFmt.format(new Date(x.fecha + "T12:00"))));
    edit.append(what, el("span", "num ing-monto", `+ ${fmt(x.monto)}`));
    edit.setAttribute("aria-label", `Editar ingreso ${x.concepto} ${fmt(x.monto)}`);
    edit.onclick = () => editarIngreso(x.id);
    const del = el("button", "del", "Borrar");
    del.type = "button"; del.setAttribute("aria-label", `Borrar ingreso ${x.concepto} ${fmt(x.monto)}`);
    del.onclick = () => borrarIngreso(x.id);
    row.append(edit, del);
    swipeable(row, () => borrarIngreso(x.id));
    return row;
  }));
  const copia = delMes.length ? [] : repetirIngresos(S.ingresos, view.y, view.m);
  $("repetir").hidden = !copia.length;
  if (copia.length) {
    const prev = new Date(view.y, view.m - 1, 1);
    $("repetir").textContent = `Repetir los de ${monthFmt.format(prev).split(" ")[0].toLowerCase()} (${fmt(copia.reduce((s, x) => s + x.monto, 0))})`;
    $("repetir").onclick = () => {
      const prevState = { ingresos: S.ingresos };
      if (commit({ ingresos: [...S.ingresos, ...copia] }))
        say(copia.length === 1 ? "Copiaste 1 ingreso. Tocalo para cambiar el monto." : `Copiaste ${copia.length} ingresos. Tocalos para cambiar los montos.`, "", prevState);
    };
  }
  if (!editingIngreso && !$("iFecha").value.startsWith(k)) $("iFecha").value = fechaIngresoDefault();
}

function resetIngresoForm() {
  editingIngreso = null;
  $("ingForm").reset();
  $("ingForm").classList.remove("editing");
  $("iFecha").value = fechaIngresoDefault();
  $("iGuardar").textContent = "Agregar ingreso";
  $("iCancelar").hidden = true;
}

function editarIngreso(id) {
  const x = S.ingresos.find(i => i.id === id);
  if (!x) return;
  editingIngreso = id;
  $("iConcepto").value = x.concepto;
  $("iMonto").value = inputFmt(x.monto);
  $("iFecha").value = x.fecha;
  $("ingForm").classList.add("editing");
  $("iGuardar").textContent = "Guardar cambios";
  $("iCancelar").hidden = false;
  $("iMonto").focus();
}

function borrarIngreso(id) {
  const x = S.ingresos.find(i => i.id === id);
  const prev = { ingresos: S.ingresos };
  if (!x || !commit({ ingresos: S.ingresos.filter(i => i.id !== id) })) return;
  if (editingIngreso === id) resetIngresoForm();
  say(`Borraste el ingreso de ${fmt(x.monto)}`, "", prev);
}

$("ingForm").addEventListener("submit", ev => {
  ev.preventDefault();
  const monto = parseMonto($("iMonto").value);
  if (isNaN(monto)) { say("Escribí un monto mayor a cero, por ejemplo 850000 o 850.000.", "err"); $("iMonto").focus(); return; }
  const data = { monto, concepto: $("iConcepto").value.trim() || "Ingreso", fecha: $("iFecha").value || fechaIngresoDefault() };
  const wasEditing = editingIngreso;
  const next = wasEditing
    ? S.ingresos.map(x => x.id === wasEditing ? { ...x, ...data } : x)
    : [...S.ingresos, { id: crypto.randomUUID(), ts: Date.now(), ...data }];
  if (!commit({ ingresos: next })) return;
  resetIngresoForm();
  const otroMes = !data.fecha.startsWith(ym(view.y, view.m));
  say(wasEditing ? "Ingreso actualizado." : otroMes ? `Ingreso guardado en ${monthFmt.format(new Date(data.fecha + "T12:00")).toLowerCase()}.` : `Ingreso guardado: ${fmt(monto)}.`);
});
$("iCancelar").onclick = resetIngresoForm;

/* ---------- Category detail sheet ---------- */

let sheetCat = null;
function abrirCategoria(id) {
  sheetCat = id;
  renderSheet();
  $("sheet").showModal();
  $("sheetBody").scrollTop = 0;
}

function cerrarSheet() {
  const d = $("sheet");
  if (!d.open || d.classList.contains("closing")) return;
  if (calm.matches) { d.close(); return; }
  d.classList.add("closing");
  d.addEventListener("animationend", () => { d.classList.remove("closing"); d.close(); }, { once: true });
}
$("sheet").addEventListener("close", () => { sheetCat = null; $("sheet").style.transform = ""; });
$("sheet").addEventListener("cancel", e => { e.preventDefault(); cerrarSheet(); });
// The panel fills the dialog, so a click whose target is the dialog itself landed on the backdrop.
$("sheet").addEventListener("click", e => { if (e.target === $("sheet")) cerrarSheet(); });
$("sheetClose").onclick = cerrarSheet;
{
  const head = $("sheetHead"), d = $("sheet"), wide = matchMedia("(min-width: 960px)");
  let y0 = null;
  head.addEventListener("pointerdown", e => {
    // On wide screens the sheet is a centered dialog, so dragging it down makes no sense.
    if (e.target.closest("button") || wide.matches) return;
    y0 = e.clientY;
    try { head.setPointerCapture(e.pointerId); } catch {}
    d.classList.add("drag");
  });
  head.addEventListener("pointermove", e => { if (y0 != null) d.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
  const fin = e => {
    if (y0 == null) return;
    const dy = e.clientY - y0;
    y0 = null;
    d.classList.remove("drag");
    if (dy > 90) cerrarSheet(); else d.style.transform = "";
  };
  head.addEventListener("pointerup", fin);
  head.addEventListener("pointercancel", fin);
}

function renderSheet() {
  const c = sheetCat;
  if (!c) return;
  const label = CAT[c]?.label ?? c;
  const movs = movimientosDelMes(S.gastos, view.y, view.m).filter(g => g.cat === c)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.ts - a.ts);
  const total = movs.reduce((s, g) => s + g.monto, 0);
  $("sheetTitle").textContent = label;
  $("sheetMes").textContent = monthFmt.format(new Date(view.y, view.m, 1));
  $("sheetTotal").textContent = fmt(total);
  const serie = serieMensual(S.gastos.filter(g => g.cat === c), view.y, view.m, 6);
  const desde = serie.findIndex(s => s.total > 0);
  const con = desde < 0 ? [] : serie.slice(desde);
  const prom = con.length ? con.reduce((a, s) => a + s.total, 0) / con.length : 0;
  $("sheetSub").textContent = (movs.length === 1 ? "1 gasto" : `${movs.length} gastos`) + (con.length > 1 ? ` · promedio ${pesos(prom)} por mes` : "");

  // Six columns; the current month is solid, the budget is a dashed line. The total is already shown above.
  const lim = S.presupuestos.cat[c];
  const max = Math.max(...serie.map(s => s.total), lim || 0) || 1;
  const plot = el("div", "mplot");
  serie.forEach((s, i) => {
    const col = el("div", "mcol" + (i === serie.length - 1 ? " cur" : ""));
    const bar = el("div", "mbar" + (CAT[c]?.h ? " ant" : ""));
    bar.style.height = `${s.total ? Math.max(3, s.total / max * 100) : 0}%`;
    bar.style.setProperty("--i", i);
    col.append(bar);
    plot.append(col);
  });
  if (lim) { const l = el("div", "mlim"); l.style.bottom = `${lim / max * 100}%`; plot.append(l); }
  const labels = el("div", "mlabels");
  labels.append(...serie.map((s, i) => el("span", i === serie.length - 1 ? "cur" : null, mesCorto(s.y, s.m))));
  $("sheetChart").replaceChildren(plot, labels);
  $("sheetChart").setAttribute("aria-label", `${label}, últimos 6 meses: ` + serie.map(s => `${monthFmt.format(new Date(s.y, s.m, 1))} ${fmt(s.total)}`).join(", ") + (lim ? `. Presupuesto ${fmt(lim)}` : ""));

  budgetBlock($("sheetBudget"), estadoPresupuesto(total, lim), false);
  $("sheetLista").replaceChildren(...(movs.length ? movs.map(g => itemRow(g, true))
    : [el("p", "empty", `Sin gastos en ${label} este mes.`)]));
}

function resetForm() {
  editingId = null;
  $("form").classList.remove("editing");
  $("formTitle").textContent = "Nuevo gasto";
  $("guardar").textContent = "Agregar gasto";
  $("cancelar").hidden = true;
  $("monto").value = ""; $("nota").value = ""; $("cuotas").value = "1";
  renderForm();
}

function startEdit(id) {
  const g = S.gastos.find(x => x.id === id);
  if (!g) return;
  if ($("sheet").open) $("sheet").close();
  editingId = id;
  cat = g.cat; medio = g.medio;
  $("monto").value = inputFmt(g.monto);
  $("nota").value = g.nota || "";
  $("fecha").value = g.fecha;
  $("cuotas").value = String(g.cuotas || 1);
  $("esHormiga").checked = !!g.hormiga;
  $("form").classList.add("editing");
  $("formTitle").textContent = g.cuotas > 1 ? `Editar compra en ${g.cuotas} cuotas (monto total)` : "Editar gasto";
  $("guardar").textContent = "Guardar cambios";
  $("cancelar").hidden = false;
  renderForm();
  $("form").scrollIntoView({ behavior: "smooth", block: "start" });
}

function borrar(id) {
  const g = S.gastos.find(x => x.id === id);
  const prev = { gastos: S.gastos };
  if (!g || !commit({ gastos: S.gastos.filter(x => x.id !== id) })) return;
  if (editingId === id) resetForm();
  say(g.cuotas > 1 ? `Borraste la compra en ${g.cuotas} cuotas` : `Borraste ${fmt(g.monto)}`, "", prev);
}

// Budget warnings for the month the expense lands in, most serious first.
function avisos(antes, despues, gCat) {
  const p = S.presupuestos;
  const checks = [
    [antes.cat[gCat] ?? 0, despues.cat[gCat] ?? 0, p.cat[gCat], `en ${CAT[gCat].label}`],
    [antes.hormiga, despues.hormiga, p.hormiga, "de gastos hormiga"],
    [antes.total, despues.total, p.total, "del presupuesto del mes"],
  ];
  const out = checks.map(([a, d, l, donde]) => ({ a: avisoPresupuesto(a, d, l), donde })).filter(x => x.a);
  out.sort((x, y) => (y.a.tipo === "pasado") - (x.a.tipo === "pasado"));
  return out.map(({ a, donde }) => a.tipo === "pasado" ? `Te pasaste ${fmt(a.monto)} ${donde}.` : `Te quedan ${fmt(a.monto)} ${donde}.`);
}

$("form").addEventListener("submit", ev => {
  ev.preventDefault();
  const monto = parseMonto($("monto").value);
  if (isNaN(monto)) { say("Escribí un monto mayor a cero, por ejemplo 1500 o 1.500,50.", "err"); $("monto").focus(); return; }
  const fecha = $("fecha").value || today();
  const data = { monto, cat, medio, cuotas: medio === "credito" ? Number($("cuotas").value) : 1,
    nota: $("nota").value.trim(), fecha, hormiga: $("esHormiga").checked };
  const wasEditing = editingId;
  if (!guardarGasto(data, wasEditing)) return;
  resetForm();
  if (!wasEditing) $("monto").focus();
});

// Saves a new or edited expense and reports it with the budget warnings of the month it lands in.
function guardarGasto(data, wasEditing = null, undo = null) {
  const next = wasEditing
    ? S.gastos.map(g => g.id === wasEditing ? { ...g, ...data } : g)
    : [...S.gastos, { id: crypto.randomUUID(), ts: Date.now(), ...data }];
  const [y, m] = data.fecha.split("-").map(Number);
  const antes = totalesDelMes(S.gastos, y, m - 1);
  if (!commit({ gastos: next })) return false;
  const warn = avisos(antes, totalesDelMes(next, y, m - 1), data.cat);
  const otroMes = y !== view.y || m - 1 !== view.m;
  const ok = wasEditing ? "Cambios guardados." : otroMes
    ? `Guardado en ${monthFmt.format(new Date(data.fecha + "T12:00")).toLowerCase()}.` : `Guardado: ${fmt(data.monto)} en ${CAT[data.cat].label}.`;
  say(warn.length ? `${ok} ${warn.join(" ")}` : ok, warn.some(w => w.startsWith("Te pasaste")) ? "err" : warn.length ? "warn" : "", undo);
  return true;
}

$("cancelar").onclick = resetForm;
$("monto").addEventListener("input", renderForm);
$("cuotas").addEventListener("change", renderForm);
$("prev").onclick = () => { view = view.m ? { y: view.y, m: view.m - 1 } : { y: view.y - 1, m: 11 }; render(); };
$("next").onclick = () => { view = view.m < 11 ? { y: view.y, m: view.m + 1 } : { y: view.y + 1, m: 0 }; render(); };

/* ---------- Presupuestos ---------- */

const BUDGET_ROWS = [["total", "Total del mes"], ["hormiga", "Gastos hormiga"], ...CATS.map(([id, label]) => [id, label])];

// Cards are built once and then only updated: rebuilding them would swallow the tap on the next field on iPhone.
const budgetCards = new Map();
function buildBudgetCards() {
  $("budgets").replaceChildren(...BUDGET_ROWS.map(([key, label], i) => {
    const card = el("div", "bcard" + (i < 2 ? " main" : ""));
    const head = el("div", "bhead");
    const lab = el("label", null, label);
    lab.htmlFor = `b-${key}`;
    const input = el("input");
    input.id = `b-${key}`; input.inputMode = "decimal"; input.autocomplete = "off"; input.placeholder = "Sin límite";
    input.setAttribute("aria-label", `Límite mensual para ${label}`);
    input.addEventListener("keydown", e => { if (e.key === "Enter") input.blur(); });
    input.addEventListener("change", () => guardarLimite(key, input.value, label));
    const field = el("span", "bmoney");
    field.append(el("span", null, "$"), input);
    head.append(lab, field);
    const status = el("div", "budget");
    card.append(head, status);
    budgetCards.set(key, { input, status });
    return card;
  }));
}

function renderPresupuestos(r) {
  if (!budgetCards.size) buildBudgetCards();
  const p = S.presupuestos, porCat = Object.fromEntries(r.porCat);
  for (const [key] of BUDGET_ROWS) {
    const { input, status } = budgetCards.get(key);
    const limite = key === "total" || key === "hormiga" ? p[key] : p.cat[key];
    const gastado = key === "total" ? r.total : key === "hormiga" ? r.hormiga : porCat[key] ?? 0;
    if (document.activeElement !== input) input.value = limite ? inputFmt(limite) : "";
    budgetBlock(status, estadoPresupuesto(gastado, limite), key === "total");
    if (status.hidden) {
      status.hidden = false;
      status.className = "budget none";
      status.replaceChildren(el("span", "sub", gastado ? `Gastaste ${fmt(gastado)} este mes` : "Sin gastos este mes"));
    }
  }
}

function guardarLimite(key, raw, label) {
  const v = raw.trim() === "" ? null : parseMonto(raw);
  if (Number.isNaN(v)) { say(`Escribí un monto válido para ${label}, o dejalo vacío para no tener límite.`, "err"); render(); return; }
  const p = { ...S.presupuestos, cat: { ...S.presupuestos.cat } };
  const target = key === "total" || key === "hormiga" ? p : p.cat;
  if (v == null) delete target[key]; else target[key] = v;
  if (commit({ presupuestos: p })) say(v == null ? `Quitaste el límite de ${label}.` : `Límite de ${label}: ${fmt(v)} por mes.`);
}

/* ---------- Meses ---------- */

const SVGNS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
const pesos = n => fmt(Math.round(n)).replace(/,00$/, ""); // whole pesos where columns are tight
const compact = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });
const mesCorto = (y, m) => new Intl.DateTimeFormat("es-AR", { month: "short" }).format(new Date(y, m, 1)).replace(".", "");
let rango = (() => { try { return Number(localStorage.getItem(RANGO_KEY)) === 12 ? 12 : 6; } catch { return 6; } })();

// Column with a 4px rounded data-end and a square base.
function columnPath(x, w, top, bottom, rounded) {
  const r = rounded ? Math.min(4, w / 2, bottom - top) : 0;
  return `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${bottom}Z`;
}

function drawChart(serie) {
  const box = $("chart");
  const W = Math.max(280, box.clientWidth || 320), H = 228;
  const pad = { l: 44, r: 6, t: 26, b: 24 };
  const limite = S.presupuestos.total;
  const { max, ticks } = escalaY(Math.max(...serie.map(s => s.total), limite || 0));
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const yOf = v => pad.t + ph - (v / max) * ph;
  const band = pw / serie.length, bw = Math.min(24, band * 0.62);
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "group", "aria-label": `Gastos de los últimos ${serie.length} meses` });

  for (const t of ticks) {
    root.append(svg("line", { x1: pad.l, x2: W - pad.r, y1: yOf(t), y2: yOf(t), class: "grid" }));
    const lab = svg("text", { x: pad.l - 6, y: yOf(t) + 4, "text-anchor": "end", class: "axis" });
    lab.textContent = t ? compact.format(t) : "0";
    root.append(lab);
  }

  const cols = serie.map((s, i) => {
    const cx = pad.l + band * i + band / 2, x = cx - bw / 2, base = yOf(0);
    const resto = Math.round((s.total - s.hormiga) * 100) / 100;
    const g = svg("g", { class: "col", style: `--i:${i}` });
    if (s.hormiga > 0) g.append(svg("path", { d: columnPath(x, bw, yOf(s.hormiga), base, resto <= 0), class: "m-hormiga" }));
    if (resto > 0) {
      const bottom = s.hormiga > 0 ? yOf(s.hormiga) - 2 : base; // 2px surface gap between the stacked segments
      const top = yOf(s.total);
      if (bottom - top > 0.5) g.append(svg("path", { d: columnPath(x, bw, top, bottom, true), class: "m-resto" }));
    }
    const actual = i === serie.length - 1;
    const xl = svg("text", { x: cx, y: H - 7, "text-anchor": "middle", class: "axis" + (actual ? " cur" : "") });
    xl.textContent = mesCorto(s.y, s.m);
    g.append(xl);
    if (actual && s.total > 0) {
      const v = svg("text", { x: cx, y: yOf(s.total) - 6, "text-anchor": "middle", class: "val" });
      v.textContent = compact.format(s.total);
      g.append(v);
    }
    // The whole band is the hit target, much bigger than the column itself.
    const hit = svg("rect", { x: pad.l + band * i, y: 0, width: band, height: H, class: "hit", tabindex: "0",
      "aria-label": `${monthFmt.format(new Date(s.y, s.m, 1))}: total ${fmt(s.total)}, hormiga ${fmt(s.hormiga)}` });
    hit.addEventListener("pointerenter", () => showTip(i));
    hit.addEventListener("pointerdown", () => showTip(i));
    hit.addEventListener("focus", () => showTip(i));
    hit.addEventListener("blur", hideTip);
    g.append(hit);
    root.append(g);
    return { g, cx, top: yOf(s.total), s, resto };
  });

  // The limit's value lives in the legend: an in-plot label collides with tall columns.
  if (limite) root.insertBefore(svg("line", { x1: pad.l, x2: W - pad.r, y1: yOf(limite), y2: yOf(limite), class: "limit" }), root.querySelector(".col"));
  root.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") hideTip(); });

  const tip = el("div", "tip");
  tip.hidden = true;
  tip.setAttribute("role", "status");
  function showTip(i) {
    const c = cols[i];
    for (const o of cols) o.g.classList.toggle("dim", o !== c);
    const row = (cls, label, v) => {
      const r = el("div", "tip-row");
      r.append(el("span", "key " + cls), el("span", null, label), el("strong", "num", fmt(v)));
      return r;
    };
    tip.replaceChildren(el("div", "tip-h", monthFmt.format(new Date(c.s.y, c.s.m, 1))), el("strong", "tip-total", fmt(c.s.total)),
      row("k-hormiga", "Hormiga", c.s.hormiga), row("k-resto", "Resto", c.resto));
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.min(Math.max(c.cx - w / 2, 0), W - w)}px`;
    tip.style.top = `${Math.max(0, c.top - h - 10)}px`;
  }
  function hideTip() {
    tip.hidden = true;
    for (const o of cols) o.g.classList.remove("dim");
  }
  hideChartTip = hideTip;
  box.replaceChildren(root, tip);
}
let hideChartTip = () => {};
document.addEventListener("pointerdown", e => { if (!e.target.closest?.(".chart")) hideChartTip(); });

function renderMeses() {
  chips($("rango"), [[6, "6 meses"], [12, "12 meses"]], rango, n => {
    rango = n;
    try { localStorage.setItem(RANGO_KEY, String(n)); } catch {}
    render();
  });
  const ajuste = $("ajuste").checked && ipc;
  const adj = (v, y, m) => ajuste ? aPesosDe(v, y, m, ipc) : v;
  const serie = serieMensual(S.gastos, view.y, view.m, rango)
    .map(s => ajuste ? { ...s, total: adj(s.total, s.y, s.m), hormiga: adj(s.hormiga, s.y, s.m) } : s);
  const [uy, um] = ipc ? ipc.ultimo.split("-").map(Number) : [];
  $("ajusteInfo").textContent = !$("ajuste").checked ? "" : !ipc ? "Bajando los datos de inflación…"
    : `Todo en pesos de ${monthFmt.format(new Date(uy, um - 1, 1)).toLowerCase()}, el último mes que publicó el INDEC. Los meses siguientes van sin ajustar. Fuente: INDEC, vía ArgentinaDatos.`;
  const desde = serie.findIndex(s => s.total > 0);
  const conDatos = desde < 0 ? [] : serie.slice(desde);
  if (conDatos.length) {
    const prom = conDatos.reduce((a, s) => a + s.total, 0) / conDatos.length;
    const top = conDatos.reduce((a, s) => s.total > a.total ? s : a);
    $("mPromedio").textContent = pesos(prom);
    $("mPromedioSub").textContent = conDatos.length === 1 ? "en 1 mes con gastos" : `en ${conDatos.length} meses`;
    $("mMax").textContent = pesos(top.total);
    $("mMaxSub").textContent = monthFmt.format(new Date(top.y, top.m, 1));
    for (const id of ["mPromedio", "mMax"]) $(id).style.setProperty("--n", $(id).textContent.length); // the CSS shrinks long figures to fit
  } else {
    $("mPromedio").textContent = $("mMax").textContent = "—";
    $("mPromedioSub").textContent = "Sin gastos en este rango";
    $("mMaxSub").textContent = "";
  }

  const legend = [["k-hormiga", "Hormiga"], ["k-resto", "Resto"]];
  if (S.presupuestos.total) legend.push(["k-limit", `Límite ${fmt(S.presupuestos.total)}`]);
  $("legend").replaceChildren(...legend.map(([cls, label]) => { const s = el("span", "leg"); s.append(el("span", "key " + cls), label); return s; }));
  drawChart(serie);

  $("mesesTabla").tBodies[0].replaceChildren(...[...serie].reverse().map(s => {
    const tr = el("tr");
    tr.append(el("th", null, monthFmt.format(new Date(s.y, s.m, 1))), el("td", "num", fmt(s.total)), el("td", "num", fmt(s.hormiga)));
    tr.firstChild.scope = "row";
    return tr;
  }));

  const prev = new Date(view.y, view.m - 1, 1);
  const rows = compararCategorias(S.gastos, view.y, view.m).map(r => {
    if (!ajuste) return r;
    const actual = adj(r.actual, view.y, view.m), anterior = adj(r.anterior, prev.getFullYear(), prev.getMonth());
    return { ...r, actual, anterior, delta: Math.round((actual - anterior) * 100) / 100 };
  });
  const thead = el("thead"), hr = el("tr");
  for (const h of ["Categoría", cap(mesCorto(view.y, view.m)), cap(mesCorto(prev.getFullYear(), prev.getMonth()))]) {
    const th = el("th", null, h); th.scope = "col"; hr.append(th);
  }
  thead.append(hr);
  const tbody = el("tbody");
  if (!rows.length) {
    const tr = el("tr"), td = el("td", "empty", "Sin gastos en estos dos meses.");
    td.colSpan = 3; tr.append(td); tbody.append(tr);
  }
  for (const r of rows) {
    const tr = el("tr");
    const name = el("th", null, CAT[r.cat]?.label ?? r.cat); name.scope = "row";
    // The difference sits under this month's amount: a fourth column does not fit a phone.
    const diff = r.delta > 0 ? `▲ ${pesos(r.delta)}` : r.delta < 0 ? `▼ ${pesos(-r.delta)}` : "= igual";
    const actual = el("td", "num", pesos(r.actual));
    actual.append(el("span", "delta", diff));
    tr.append(name, actual, el("td", "num", pesos(r.anterior)));
    tbody.append(tr);
  }
  $("cmpTabla").replaceChildren(thead, tbody);
}

let resizeTimer = 0;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (tab === "meses") render(); }, 150); });

/* ---------- Fijos ---------- */

function fillSelect(sel, items) {
  sel.replaceChildren(...items.map(([id, label]) => { const o = el("option", null, label); o.value = id; return o; }));
}
fillSelect($("fCat"), CATS);
fillSelect($("fMedio"), MEDIOS);

function renderFijos() {
  const activos = S.fijos.filter(f => f.activo);
  countTo($("fijosTotal"), activos.reduce((s, f) => s + f.monto, 0));
  const lista = [...S.fijos].sort((a, b) => (b.activo - a.activo) || a.dia - b.dia);
  $("fijosLista").replaceChildren(...(lista.length ? lista.map(f => {
    const row = el("div", "fijo" + (f.activo ? "" : " paused"));
    const what = el("div", "what");
    const name = el("span", "cat", f.nombre);
    what.append(name);
    if (!f.activo) what.append(el("span", "tag", "pausado"));
    what.append(el("span", "meta", `Día ${f.dia} · ${CAT[f.cat]?.label ?? f.cat} · ${MEDIO[f.medio] ?? f.medio}`));
    const acts = el("div", "fijo-acts");
    const mk = (txt, fn, aria) => { const b = el("button", "link", txt); b.type = "button"; b.onclick = fn; b.setAttribute("aria-label", `${aria} ${f.nombre}`); return b; };
    acts.append(mk("Editar", () => editarFijo(f.id), "Editar"),
      mk(f.activo ? "Pausar" : "Reanudar", () => pausarFijo(f.id), f.activo ? "Pausar" : "Reanudar"),
      mk("Borrar", () => borrarFijo(f.id), "Borrar"));
    row.append(what, el("span", "num", fmt(f.monto)), acts);
    return row;
  }) : [el("p", "empty", "Todavía no tenés gastos fijos. Agregá el alquiler, los servicios o tus suscripciones y se cargan solos cada mes.")]));
}

function resetFijoForm() {
  editingFijo = null;
  for (const id of ["fNombre", "fMonto", "fDia"]) $(id).value = "";
  $("fCat").value = "servicios"; $("fMedio").value = "debito"; $("fEsteMes").checked = true;
  $("fEsteMesRow").hidden = false;
  $("fijoTitle").textContent = "Nuevo gasto fijo";
  $("fGuardar").textContent = "Agregar gasto fijo";
  $("fCancelar").hidden = true;
  $("fijoForm").classList.remove("editing");
}

function editarFijo(id) {
  const f = S.fijos.find(x => x.id === id);
  if (!f) return;
  editingFijo = id;
  $("fNombre").value = f.nombre; $("fMonto").value = inputFmt(f.monto);
  $("fCat").value = f.cat; $("fMedio").value = f.medio; $("fDia").value = String(f.dia);
  $("fEsteMesRow").hidden = true;
  $("fijoTitle").textContent = `Editar ${f.nombre} (cambia desde el próximo cargo)`;
  $("fGuardar").textContent = "Guardar cambios";
  $("fCancelar").hidden = false;
  $("fijoForm").classList.add("editing");
  $("fijoForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Resuming starts with this month only if its day has not passed yet, so months spent paused are never back-filled.
function pausarFijo(id) {
  const now = new Date();
  const next = S.fijos.map(f => {
    if (f.id !== id) return f;
    if (f.activo) return { ...f, activo: false };
    const dia = Math.min(f.dia, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
    return { ...f, activo: true, ultimoMes: ultimoMesInicial(now, dia > now.getDate()) };
  });
  if (commit({ fijos: next })) {
    const f = next.find(x => x.id === id);
    say(f.activo ? `${f.nombre} se vuelve a cargar cada mes.` : `${f.nombre} pausado. No se carga hasta que lo reanudes.`);
  }
}

function borrarFijo(id) {
  const f = S.fijos.find(x => x.id === id);
  const prev = { fijos: S.fijos };
  if (!f || !commit({ fijos: S.fijos.filter(x => x.id !== id) })) return;
  if (editingFijo === id) resetFijoForm();
  say(`Borraste ${f.nombre}. Los gastos ya cargados quedan.`, "", prev);
}

$("fijoForm").addEventListener("submit", ev => {
  ev.preventDefault();
  const nombre = $("fNombre").value.trim();
  const monto = parseMonto($("fMonto").value);
  const dia = Number($("fDia").value);
  if (!nombre) { say("Poné un nombre, por ejemplo Alquiler.", "err"); $("fNombre").focus(); return; }
  if (isNaN(monto)) { say("Escribí un monto mayor a cero.", "err"); $("fMonto").focus(); return; }
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) { say("El día tiene que ser un número del 1 al 31.", "err"); $("fDia").focus(); return; }
  const data = { nombre, monto, cat: $("fCat").value, medio: $("fMedio").value, dia };
  const wasEditing = editingFijo;
  const next = wasEditing
    ? S.fijos.map(f => f.id === wasEditing ? { ...f, ...data } : f)
    : [...S.fijos, { id: crypto.randomUUID(), activo: true, ultimoMes: ultimoMesInicial(new Date(), $("fEsteMes").checked), ...data }];
  if (!commit({ fijos: next })) return;
  resetFijoForm();
  const creados = aplicarFijos();
  say(wasEditing ? `${nombre} actualizado.` : creados ? `${nombre} agregado y cargado este mes.` : `${nombre} agregado. Se carga solo el día ${dia}.`);
});
$("fCancelar").onclick = resetFijoForm;

// Creates the fixed expenses that are due. Returns how many were added.
function aplicarFijos() {
  const r = fijosPendientes(S.fijos, new Date());
  if (!r.gastos.length) return 0;
  const ids = new Set(S.gastos.map(g => g.id));
  const nuevos = r.gastos.filter(g => !ids.has(g.id));
  return commit({ gastos: [...S.gastos, ...nuevos], fijos: r.fijos }) ? nuevos.length : 0;
}

/* ---------- Copia ---------- */

// On iPhone the share sheet is the way to save a file to Files or iCloud; elsewhere fall back to a download.
async function guardarArchivo(nombre, texto, tipo) {
  const file = new File([texto], nombre, { type: tipo });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; }
    catch (e) { if (e.name === "AbortError") return false; }
  }
  const a = el("a");
  a.href = URL.createObjectURL(file); a.download = nombre;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}

async function exportar() {
  const json = JSON.stringify({ app: "gastos-hormiga", version: 3, exportado: new Date().toISOString(),
    gastos: S.gastos, presupuestos: S.presupuestos, fijos: S.fijos, ingresos: S.ingresos }, null, 1);
  if (await guardarArchivo(`gastos-${today()}.json`, json, "application/json")) {
    try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch {}
    render();
    say("Copia guardada.");
  }
}
$("exportar").onclick = exportar;
$("bannerBtn").onclick = exportar;
$("csv").onclick = () => guardarArchivo(`gastos-${today()}.csv`, aCSV(S.gastos), "text/csv");

$("importar").addEventListener("change", async ev => {
  const file = ev.target.files?.[0];
  ev.target.value = "";
  if (!file) return;
  try {
    const r = leerBackup(JSON.parse(await file.text()));
    const merge = (cur, inc) => { const m = new Map(cur.map(x => [x.id, x])); for (const x of inc) m.set(x.id, x); return [...m.values()]; };
    const changes = { gastos: merge(S.gastos, r.gastos) };
    if (r.fijos) changes.fijos = merge(S.fijos, r.fijos);
    if (r.ingresos) changes.ingresos = merge(S.ingresos, r.ingresos);
    if (r.presupuestos) changes.presupuestos = r.presupuestos;
    if (commit(changes)) {
      aplicarFijos();
      say(`Restauraste ${r.gastos.length} gastos${r.fijos ? `, ${r.fijos.length} fijos` : ""}${r.ingresos ? `, ${r.ingresos.length} ingresos` : ""}${r.presupuestos ? " y tus presupuestos" : ""}.`);
    }
  } catch (e) {
    say(e instanceof SyntaxError ? "Ese archivo no es una copia de seguridad válida." : e.message, "err");
  }
});

// Inflation data: kept on the phone, refreshed at most once a week; no user data is sent.
let ipc = (() => { try { return leerIPC(read(IPC_KEY, null)?.data); } catch { return null; } })();
async function cargarIPC() {
  const cache = read(IPC_KEY, null);
  if (ipc && cache && Date.now() - cache.ts < 7 * 864e5) return;
  try {
    const res = await fetch(IPC_URL);
    if (!res.ok) throw new Error(res.status);
    const data = (await res.json()).filter?.(x => x?.fecha >= "2015"); // older months are never charted
    ipc = leerIPC(data);
    try { localStorage.setItem(IPC_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
  } catch {
    if (ipc) return; // stale data is better than none
    $("ajuste").checked = false;
    try { localStorage.setItem(AJUSTE_KEY, "0"); } catch {}
    say("No se pudieron bajar los datos de inflación. Probá de nuevo cuando tengas conexión.", "err");
  }
  if (tab === "meses") render();
}
$("ajuste").checked = (() => { try { return localStorage.getItem(AJUSTE_KEY) === "1"; } catch { return false; } })();
$("ajuste").addEventListener("change", () => {
  try { localStorage.setItem(AJUSTE_KEY, $("ajuste").checked ? "1" : "0"); } catch {}
  render();
  if ($("ajuste").checked) cargarIPC();
});
if ($("ajuste").checked) cargarIPC();

/* ---------- render ---------- */

function render() {
  const conMes = tab === "gastos" || tab === "presupuestos" || tab === "meses";
  // visibility keeps the title centered while the arrows are not needed
  $("prev").style.visibility = $("next").style.visibility = conMes ? "" : "hidden";
  const titulo = conMes ? monthFmt.format(new Date(view.y, view.m, 1))
    : tab === "fijos" ? "Gastos fijos" : "Copia de seguridad";
  if ($("mes").textContent !== titulo) {
    $("mes").textContent = titulo;
    $("mes").classList.remove("swap");
    void $("mes").offsetWidth; // restart the title animation
    $("mes").classList.add("swap");
  }
  if (tab === "meses") renderMeses();
  else if (conMes) {
    const movs = movimientosDelMes(S.gastos, view.y, view.m);
    const r = resumen(movs, view.y, view.m);
    if (tab === "gastos") renderGastos(movs, r); else renderPresupuestos(r);
  } else if (tab === "fijos") renderFijos();
  if ($("sheet").open) renderSheet();
  else {
    const last = Number(localStorage.getItem(BACKUP_KEY)) || 0;
    $("ultimaCopia").textContent = last ? `Última copia: ${new Date(last).toLocaleDateString("es-AR")}.` : "Todavía no guardaste ninguna copia.";
  }
}

let fechaAuto = today();
$("fecha").value = fechaAuto;
$("esHormiga").checked = CAT[cat].h;
renderForm();
resetFijoForm();
resetIngresoForm();
showTab(TABS.includes(tab) ? tab : "gastos");
const creados = aplicarFijos();
if (creados) say(creados === 1 ? "Se cargó 1 gasto fijo." : `Se cargaron ${creados} gastos fijos.`);
// The installed app can stay open for days; check for due fixed expenses whenever it comes back to the screen.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  // Move the date forward only if it still shows the day it was set to, never over a date picked by hand.
  if (!editingId && $("fecha").value === fechaAuto) $("fecha").value = fechaAuto = today();
  const n = aplicarFijos();
  if (n) say(n === 1 ? "Se cargó 1 gasto fijo." : `Se cargaron ${n} gastos fijos.`);
});

navigator.storage?.persist?.();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

/* ---------- Instalar ---------- */
// Chrome and Android hand over a prompt; Safari on iPhone never does, so there the button explains the Share menu.
let installPrompt = null;
const INSTALAR_KEY = "gastos.instalarCerrado";
$("instalar").hidden = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true || !!localStorage.getItem(INSTALAR_KEY);
$("instalarX").onclick = () => { $("instalar").hidden = true; localStorage.setItem(INSTALAR_KEY, "1"); };
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; });
addEventListener("appinstalled", () => { $("instalar").hidden = true; });
$("instalarBtn").onclick = async () => {
  if (!installPrompt) return say("En Safari tocá Compartir (el cuadrado con la flecha) y después \"Agregar a inicio\".", "info");
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = null;
  if (outcome === "accepted") $("instalar").hidden = true;
};

// Pure logic, no DOM: tested by logic.test.mjs with `node --test`.

// [id, label, hormiga by default]
const DEFAULT_CATS = [
  ["kiosco", "Kiosco", true], ["cafe", "Café", true], ["delivery", "Delivery", true],
  ["comida", "Comida", false], ["super", "Súper", false], ["transporte", "Transporte", false],
  ["salidas", "Salidas", false], ["servicios", "Servicios", false], ["salud", "Salud", false],
  ["ropa", "Ropa", false], ["hogar", "Hogar", false], ["suscripciones", "Suscripciones", false],
  ["otros", "Otros", false],
];
// Filled in place by usarCategorias, so every importer sees the user's categories.
// CATS: the visible ones to pick from, as [id, label, h]. CAT: every one by id, hidden too, so old expenses keep their name.
export const CATS = [];
export const CAT = {};

// Validates the saved category list: renames, hidden flags and custom ones are kept; a default can never go missing,
// and "otros" stays visible and last because it is where unknown categories land.
export function leerCategorias(raw) {
  const out = [], seen = new Set();
  for (const c of Array.isArray(raw) ? raw : []) {
    const label = typeof c?.label === "string" ? c.label.trim().slice(0, 24) : "";
    if (typeof c?.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(c.id) || !label || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({ id: c.id, label, h: !!c.h, oculta: c.id !== "otros" && !!c.oculta });
  }
  for (const [id, label, h] of DEFAULT_CATS) if (!seen.has(id)) out.push({ id, label, h, oculta: false });
  const i = out.findIndex(c => c.id === "otros");
  out.push(...out.splice(i, 1));
  return out;
}

export function usarCategorias(lista) {
  CATS.length = 0;
  for (const k of Object.keys(CAT)) delete CAT[k];
  for (const c of lista) {
    CAT[c.id] = { label: c.label, h: c.h };
    if (!c.oculta) CATS.push([c.id, c.label, c.h]);
  }
}
usarCategorias(leerCategorias(null));

export const MEDIOS = [
  ["efectivo", "Efectivo"], ["debito", "Débito"], ["credito", "Crédito"],
  ["mp", "Mercado Pago"], ["transferencia", "Transferencia"],
];
export const MEDIO = Object.fromEntries(MEDIOS);

const pad = n => String(n).padStart(2, "0");

// Accepts "1.500", "1500,50", "2.5", "$ 300"; anything not positive is NaN.
export function parseMonto(s) {
  s = String(s ?? "").replace(/[$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return s !== "" && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : NaN;
}

// Installment k (0-based) of n; the last one takes the leftover cents so the parts add up to the total.
export function parteCuota(total, n, k) {
  const c = Math.round(total * 100);
  const base = Math.floor(c / n);
  return (k === n - 1 ? c - base * (n - 1) : base) / 100;
}

// Rows for month m (0-11) of year y: a purchase in n installments shows up in n consecutive months.
export function movimientosDelMes(gastos, y, m) {
  const last = new Date(y, m + 1, 0).getDate();
  const out = [];
  for (const g of gastos) {
    const [gy, gm, gd] = g.fecha.split("-").map(Number);
    const n = g.cuotas > 1 ? g.cuotas : 1;
    const k = (y - gy) * 12 + (m + 1 - gm);
    if (k < 0 || k >= n) continue;
    out.push({
      ...g,
      fecha: n > 1 ? `${y}-${pad(m + 1)}-${pad(Math.min(gd, last))}` : g.fecha,
      monto: n > 1 ? parteCuota(g.monto, n, k) : g.monto,
      cuota: n > 1 ? k + 1 : 0,
    });
  }
  return out;
}

export function resumen(movs, y, m, now = new Date()) {
  const sum = arr => Math.round(arr.reduce((s, g) => s + g.monto, 0) * 100) / 100;
  const total = sum(movs);
  const hormiga = sum(movs.filter(g => g.hormiga));
  const isCurrent = y === now.getFullYear() && m === now.getMonth();
  const days = isCurrent ? now.getDate() : new Date(y, m + 1, 0).getDate();
  const group = key => {
    const acc = {};
    for (const g of movs) acc[g[key]] = (acc[g[key]] || 0) + g.monto;
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  };
  return {
    total, hormiga, isCurrent,
    proyeccionAnual: hormiga > 0 ? Math.round(hormiga / days * 365) : 0,
    porCat: group("cat"),
    porMedio: group("medio"),
  };
}

const positivo = v => typeof v === "number" && Number.isFinite(v) && v > 0;
const mesKey = (y, m) => `${y}-${pad(m + 1)}`;

// Validates an imported backup. v1 backups carry only expenses, so budgets and fixed expenses come back null (keep the current ones).
export function leerBackup(obj) {
  const list = Array.isArray(obj) ? obj : obj?.gastos;
  if (!Array.isArray(list)) throw new Error("El archivo no es una copia de seguridad de Gastos Hormiga.");
  // v4 backups carry the category list; their custom categories must survive the check below.
  const categorias = Array.isArray(obj?.categorias) ? leerCategorias(obj.categorias) : null;
  const conocida = id => !!CAT[id] || !!categorias?.some(c => c.id === id);
  const gastos = list.map((g, i) => {
    const monto = typeof g.monto === "number" ? g.monto : parseMonto(g.monto);
    if (!(monto > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(g.fecha ?? "")) throw new Error(`El gasto número ${i + 1} tiene datos inválidos.`);
    const cuotas = Number.isInteger(g.cuotas) && g.cuotas > 1 && g.cuotas <= 60 ? g.cuotas : 1;
    const out = {
      id: typeof g.id === "string" && g.id ? g.id : crypto.randomUUID(),
      monto,
      cat: conocida(g.cat) ? g.cat : "otros",
      medio: MEDIO[g.medio] ? g.medio : "efectivo",
      cuotas,
      nota: String(g.nota ?? "").slice(0, 80),
      fecha: g.fecha,
      hormiga: !!g.hormiga,
      ts: Number.isFinite(g.ts) ? g.ts : Date.now(),
    };
    if (typeof g.fijoId === "string" && g.fijoId) out.fijoId = g.fijoId;
    if (positivo(g.usd) && positivo(g.cotizacion) && CASAS_DOLAR.some(([k]) => k === g.tipoDolar)) Object.assign(out, { usd: g.usd, cotizacion: g.cotizacion, tipoDolar: g.tipoDolar });
    return out;
  });

  let presupuestos = null;
  if (obj?.presupuestos && typeof obj.presupuestos === "object") {
    const p = obj.presupuestos;
    presupuestos = { cat: {} };
    if (positivo(p.total)) presupuestos.total = p.total;
    if (positivo(p.hormiga)) presupuestos.hormiga = p.hormiga;
    for (const [id, v] of Object.entries(p.cat ?? {})) if (conocida(id) && positivo(v)) presupuestos.cat[id] = v;
  }

  let fijos = null;
  if (Array.isArray(obj?.fijos)) {
    fijos = obj.fijos.map((f, i) => {
      if (!positivo(f.monto) || !Number.isInteger(f.dia) || f.dia < 1 || f.dia > 31 || !/^\d{4}-\d{2}$/.test(f.ultimoMes ?? ""))
        throw new Error(`El gasto fijo número ${i + 1} tiene datos inválidos.`);
      return {
        id: typeof f.id === "string" && f.id ? f.id : crypto.randomUUID(),
        nombre: String(f.nombre ?? "").slice(0, 40) || "Gasto fijo",
        monto: f.monto,
        cat: conocida(f.cat) ? f.cat : "otros",
        medio: MEDIO[f.medio] ? f.medio : "efectivo",
        dia: f.dia,
        activo: f.activo !== false,
        ultimoMes: f.ultimoMes,
      };
    });
  }
  let ingresos = null;
  if (Array.isArray(obj?.ingresos)) {
    ingresos = obj.ingresos.map((x, i) => {
      if (!positivo(x.monto) || !/^\d{4}-\d{2}-\d{2}$/.test(x.fecha ?? "")) throw new Error(`El ingreso número ${i + 1} tiene datos inválidos.`);
      return {
        id: typeof x.id === "string" && x.id ? x.id : crypto.randomUUID(),
        monto: x.monto,
        concepto: String(x.concepto ?? "").slice(0, 40) || "Ingreso",
        fecha: x.fecha,
        ts: Number.isFinite(x.ts) ? x.ts : Date.now(),
      };
    });
  }
  return { gastos, presupuestos, fijos, ingresos, categorias };
}

// null when there is no limit. "cerca" covers 80% up to exactly 100%.
export function estadoPresupuesto(gastado, limite) {
  if (!positivo(limite)) return null;
  const pct = gastado / limite;
  return {
    gastado, limite,
    queda: Math.round((limite - gastado) * 100) / 100,
    pct,
    estado: pct > 1 ? "pasado" : pct >= 0.8 ? "cerca" : "bien",
  };
}

// Warns only on the save that crosses 80% or 100%, so it never repeats on every later expense.
export function avisoPresupuesto(antes, despues, limite) {
  if (!positivo(limite)) return null;
  const r = n => Math.round(n * 100) / 100;
  if (antes <= limite && despues > limite) return { tipo: "pasado", monto: r(despues - limite) };
  if (antes < limite * 0.8 && despues >= limite * 0.8) return { tipo: "cerca", monto: r(limite - despues) };
  return null;
}

// What can still be spent per day, counting today; only meaningful for the current or a future month.
export function porDia(queda, y, m, now = new Date()) {
  if (!(queda > 0)) return null;
  const last = new Date(y, m + 1, 0).getDate();
  const cur = now.getFullYear() * 12 + now.getMonth(), target = y * 12 + m;
  if (target < cur) return null;
  const dias = target === cur ? last - now.getDate() + 1 : last;
  return Math.floor(queda / dias);
}

// ultimoMes for a new or resumed fixed expense: the previous month makes this month's charge count.
export function ultimoMesInicial(hoy, incluirEsteMes) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth() - (incluirEsteMes ? 1 : 0), 1);
  return mesKey(d.getFullYear(), d.getMonth());
}

// Expenses due since each fixed expense's ultimoMes. Ids are "<fijoId>:<YYYY-MM>", and ultimoMes only moves forward,
// so running it again never duplicates and deleting a generated expense never brings it back.
export function fijosPendientes(fijos, hoy = new Date()) {
  const cur = hoy.getFullYear() * 12 + hoy.getMonth();
  const gastos = [];
  const next = fijos.map(f => {
    if (!f.activo) return f;
    const [uy, um] = f.ultimoMes.split("-").map(Number);
    let ultimoMes = f.ultimoMes;
    for (let t = uy * 12 + um; t <= cur; t++) {
      const y = Math.floor(t / 12), m = t % 12;
      const dia = Math.min(f.dia, new Date(y, m + 1, 0).getDate());
      if (t === cur && dia > hoy.getDate()) break;
      ultimoMes = mesKey(y, m);
      gastos.push({ id: `${f.id}:${ultimoMes}`, fijoId: f.id, monto: f.monto, cat: f.cat, medio: f.medio, cuotas: 1,
        nota: f.nombre, fecha: `${ultimoMes}-${pad(dia)}`, hormiga: false, ts: hoy.getTime() });
    }
    return ultimoMes === f.ultimoMes ? f : { ...f, ultimoMes };
  });
  return { gastos, fijos: next };
}

const round2 = n => Math.round(n * 100) / 100;
const sumarPorCat = movs => {
  const acc = {};
  for (const g of movs) acc[g.cat] = (acc[g.cat] || 0) + g.monto;
  return acc;
};

// n months ending at month m of year y, oldest first; installments count in the month they are paid.
export function serieMensual(gastos, y, m, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - i, 1);
    const movs = movimientosDelMes(gastos, d.getFullYear(), d.getMonth());
    out.push({
      y: d.getFullYear(), m: d.getMonth(),
      total: round2(movs.reduce((s, g) => s + g.monto, 0)),
      hormiga: round2(movs.filter(g => g.hormiga).reduce((s, g) => s + g.monto, 0)),
    });
  }
  return out;
}

export function compararCategorias(gastos, y, m) {
  const prev = new Date(y, m - 1, 1);
  const actual = sumarPorCat(movimientosDelMes(gastos, y, m));
  const anterior = sumarPorCat(movimientosDelMes(gastos, prev.getFullYear(), prev.getMonth()));
  return [...new Set([...Object.keys(actual), ...Object.keys(anterior)])]
    .map(cat => ({ cat, actual: round2(actual[cat] || 0), anterior: round2(anterior[cat] || 0) }))
    .map(r => ({ ...r, delta: round2(r.actual - r.anterior) }))
    .filter(r => r.actual || r.anterior)
    .sort((a, b) => b.actual - a.actual || b.anterior - a.anterior);
}

// Clean axis: the smallest 1/2/2.5/5 step that covers the value in at most 4 intervals.
export function escalaY(valor) {
  const v = valor > 0 ? valor : 1000;
  const mag = 10 ** Math.floor(Math.log10(v / 4));
  let step = 10 * mag;
  for (const f of [1, 2, 2.5, 5]) if (Math.ceil(v / (f * mag)) <= 4) { step = f * mag; break; }
  const n = Math.ceil(v / step);
  return { max: n * step, ticks: Array.from({ length: n + 1 }, (_, i) => i * step) };
}

// A leading apostrophe stops Excel from running text that starts like a formula.
const csvCell = v => {
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

// Semicolon-separated with decimal comma, which is what Excel in Spanish expects.
export function aCSV(gastos, ingresos = []) {
  const coma = n => String(n).replace(".", ",");
  const filas = [
    ...gastos.map(g => [g.fecha, "Gasto", coma(g.monto), CAT[g.cat]?.label ?? g.cat, MEDIO[g.medio] ?? g.medio,
      String(g.cuotas || 1), g.hormiga ? "Sí" : "No", g.nota || ""]),
    ...ingresos.map(x => [x.fecha, "Ingreso", coma(x.monto), "", "", "", "", x.concepto || ""]),
  ].sort((a, b) => a[0].localeCompare(b[0]));
  const rows = [["Fecha", "Tipo", "Monto", "Categoría", "Medio de pago", "Cuotas", "Hormiga", "Nota"], ...filas];
  return "﻿" + rows.map(r => r.map(csvCell).join(";")).join("\r\n");
}

// Quick-add buttons: what was entered at least twice in the last 60 days with the same category, amount and payment.
// Fixed expenses and installment purchases are left out: they are not typed by hand. Dollar ones too: their pesos change with the rate.
export function frecuentes(gastos, hoy = new Date(), n = 4) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 60);
  const desde = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const grupos = new Map();
  for (const g of gastos) {
    if (g.fijoId || g.cuotas > 1 || g.usd || g.fecha < desde) continue;
    const k = `${g.cat}|${g.monto}|${g.medio}`;
    const x = grupos.get(k);
    if (!x) grupos.set(k, { cat: g.cat, monto: g.monto, medio: g.medio, hormiga: !!g.hormiga, veces: 1, ultima: g.fecha });
    else {
      x.veces++;
      if (g.fecha >= x.ultima) { x.ultima = g.fecha; x.hormiga = !!g.hormiga; }
    }
  }
  return [...grupos.values()].filter(x => x.veces >= 2)
    .sort((a, b) => b.veces - a.veces || b.ultima.localeCompare(a.ultima)).slice(0, n)
    .map(({ ultima, ...x }) => x);
}

const plano = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Expenses of any month whose note, category or payment label contains the text, newest first.
export function buscar(gastos, texto) {
  const q = plano(texto).trim();
  if (!q) return [];
  return gastos.filter(g => plano(`${g.nota ?? ""} ${CAT[g.cat]?.label ?? g.cat} ${MEDIO[g.medio] ?? g.medio}`).includes(q))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.ts - a.ts);
}

// Monthly inflation rates ([{ fecha: "2026-09-30", valor: 1.9 }], as INDEC publishes them) chained into price levels.
export function leerIPC(lista) {
  if (!Array.isArray(lista) || !lista.length) throw new Error("No llegaron datos de inflación.");
  const filas = lista.map(x => {
    if (!/^\d{4}-\d{2}/.test(x?.fecha ?? "") || typeof x.valor !== "number" || !Number.isFinite(x.valor)) throw new Error("Los datos de inflación no tienen el formato esperado.");
    return [x.fecha.slice(0, 7), x.valor];
  }).sort((a, b) => a[0].localeCompare(b[0]));
  const niveles = {};
  let nivel = 100;
  for (const [mes, v] of filas) niveles[mes] = nivel *= 1 + v / 100;
  return { niveles, primero: filas[0][0], ultimo: filas.at(-1)[0] };
}

// An amount spent in month m (0-11) of year y, in pesos of the last month with data.
// Months after the data are not adjusted; months before it count as the first month.
export function aPesosDe(monto, y, m, ipc) {
  const k = mesKey(y, m);
  const mes = k > ipc.ultimo ? ipc.ultimo : k < ipc.primero ? ipc.primero : k;
  return round2(monto * ipc.niveles[ipc.ultimo] / ipc.niveles[mes]);
}

// The previous month's income copied into month m of year y; day 31 becomes the month's last day.
export function repetirIngresos(ingresos, y, m, ts = Date.now()) {
  const prev = new Date(y, m - 1, 1), desde = mesKey(prev.getFullYear(), prev.getMonth());
  const ultimo = new Date(y, m + 1, 0).getDate();
  return ingresos.filter(x => x.fecha.startsWith(desde)).sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map(x => ({ id: crypto.randomUUID(), monto: x.monto, concepto: x.concepto,
      fecha: `${mesKey(y, m)}-${pad(Math.min(Number(x.fecha.slice(8)), ultimo))}`, ts }));
}

// The new-expense keypad has a + key: "1500+800" is 2300. Each part follows parseMonto; a trailing + is still being typed.
export function evaluarMonto(s) {
  const partes = String(s ?? "").replace(/\+\s*$/, "").split("+");
  const total = partes.reduce((acc, p) => acc + parseMonto(p), 0);
  return total > 0 ? round2(total) : NaN;
}

// Total of each day of month m (0-11) of year y, for the calendar. nivel 1-4 is the rank among days with spending,
// so a rent day does not make every other day look empty; equal totals share a level and the highest is always 4.
export function gastoPorDia(movs, y, m) {
  const dias = Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => ({ dia: i + 1, total: 0, nivel: 0 }));
  const k = mesKey(y, m);
  for (const g of movs) if (g.fecha.startsWith(k)) dias[Number(g.fecha.slice(8)) - 1].total += g.monto;
  const orden = dias.map(d => d.total = round2(d.total)).filter(v => v > 0).sort((a, b) => a - b);
  for (const d of dias) if (d.total > 0) d.nivel = Math.ceil((orden.lastIndexOf(d.total) + 1) / orden.length * 4);
  return dias;
}

// One key of the amount keypad applied to what the field shows: "1.500 + 8" plus "0" is "1.500 + 80".
export function teclear(valor, tecla) {
  let raw = String(valor ?? "").replace(/[.\s]/g, "");
  const ultima = raw.split("+").at(-1), [ent, dec] = ultima.split(",");
  if (tecla === "borrar") raw = raw.slice(0, -1);
  else if (tecla === "+") { if (ultima && !ultima.endsWith(",")) raw += "+"; }
  else if (tecla === ",") { if (dec == null) raw += ultima ? "," : "0,"; }
  else if (/^\d+$/.test(tecla)) {
    if (dec != null) { if (dec.length + tecla.length <= 2) raw += tecla; }
    else if (ent === "0") raw = raw.slice(0, -1) + (Number(tecla) ? tecla : "0");
    else if (!ent && /^0+$/.test(tecla)) raw += tecla.length === 1 ? "0" : "";
    else if (ent.length + tecla.length <= 10) raw += tecla;
  }
  return raw.split("+").map(p => {
    const [e, d] = p.split(",");
    return e.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (d != null ? "," + d : "");
  }).join(" + ");
}

// Installments still to pay in each month after the current one, until the last purchase is paid off.
export function cuotasPendientes(gastos, hoy = new Date()) {
  const con = gastos.filter(g => g.cuotas > 1);
  const fin = Math.max(-1, ...con.map(g => { const [y, m] = g.fecha.split("-").map(Number); return y * 12 + m - 1 + g.cuotas - 1; }));
  const out = [];
  for (let t = hoy.getFullYear() * 12 + hoy.getMonth() + 1; t <= fin; t++) {
    const y = Math.floor(t / 12), m = t % 12, movs = movimientosDelMes(con, y, m);
    if (movs.length) out.push({ y, m, total: round2(movs.reduce((s, g) => s + g.monto, 0)), compras: movs.length });
  }
  return out;
}

// Category of earlier expenses with this note: exact notes first, else notes starting with it (3+ letters).
// The most used wins, a tie goes to the latest; hidden or unknown categories are never suggested.
export function sugerirCategoria(gastos, nota) {
  const q = plano(nota).trim();
  if (!q) return null;
  const visible = new Set(CATS.map(([id]) => id));
  const elegir = lista => {
    const c = new Map();
    for (const g of lista) {
      if (!visible.has(g.cat)) continue;
      const x = c.get(g.cat) ?? { n: 0, ult: "" }, k = `${g.fecha}|${String(g.ts).padStart(15, "0")}`;
      c.set(g.cat, { n: x.n + 1, ult: k > x.ult ? k : x.ult });
    }
    return [...c].sort((a, b) => b[1].n - a[1].n || b[1].ult.localeCompare(a[1].ult))[0]?.[0] ?? null;
  };
  const exactas = gastos.filter(g => visible.has(g.cat) && plano(g.nota).trim() === q);
  if (exactas.length) return elegir(exactas);
  return q.length >= 3 ? elegir(gastos.filter(g => plano(g.nota).trim().startsWith(q))) : null;
}

// Notes typed before, for suggestions while typing: one per spelling-insensitive note, most used first, latest spelling.
export function notasUsadas(gastos, n = 50) {
  const m = new Map();
  for (const g of [...gastos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.ts - b.ts)) {
    const nota = String(g.nota ?? "").trim(), k = plano(nota);
    if (!k) continue;
    m.set(k, { nota, veces: (m.get(k)?.veces ?? 0) + 1 });
  }
  return [...m.values()].sort((a, b) => b.veces - a.veces).slice(0, n).map(x => x.nota);
}

// Picker order: most used in the last 90 days first; ties keep their order and Otros stays last.
export function ordenarCategorias(cats, gastos, hoy = new Date()) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 90);
  const desde = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const n = {};
  for (const g of gastos) if (g.fecha >= desde) n[g.cat] = (n[g.cat] || 0) + 1;
  return cats.map((c, i) => [c, i]).sort(([a, i], [b, j]) => (a[0] === "otros") - (b[0] === "otros") || (n[b[0]] || 0) - (n[a[0]] || 0) || i - j).map(([c]) => c);
}

// Fixed expenses and installments are paid on one day and would make day 1 look like overspending, so pace counts only the rest.
export const gastoVariable = movs => round2(movs.filter(g => !g.fijoId && !g.cuota).reduce((s, g) => s + g.monto, 0));

// What variable spending should reach by month's end: the budget minus this month's fixed expenses, installments
// and active fixed ones not generated yet; with no budget, the average of the last 3 months with variable spending.
export function referenciaRitmo(gastos, fijos, y, m, presupuesto) {
  const movs = movimientosDelMes(gastos, y, m);
  if (positivo(presupuesto)) {
    const k = mesKey(y, m);
    const pendientes = fijos.filter(f => f.activo && f.ultimoMes < k).reduce((s, f) => s + f.monto, 0);
    const ref = round2(presupuesto - (movs.reduce((s, g) => s + g.monto, 0) - gastoVariable(movs)) - pendientes);
    return ref > 0 ? ref : null;
  }
  const meses = [];
  for (let i = 1; i <= 12 && meses.length < 3; i++) {
    const d = new Date(y, m - i, 1), v = gastoVariable(movimientosDelMes(gastos, d.getFullYear(), d.getMonth()));
    if (v > 0) meses.push(v);
  }
  return meses.length ? round2(meses.reduce((a, b) => a + b, 0) / meses.length) : null;
}

// Share of the reference used against share of the month gone, for the current month only; 10 points either way is on pace.
export function ritmoMes(gastado, referencia, y, m, hoy = new Date()) {
  if (!positivo(referencia) || y !== hoy.getFullYear() || m !== hoy.getMonth()) return null;
  const dias = new Date(y, m + 1, 0).getDate(), dia = hoy.getDate(), tiempo = dia / dias, uso = gastado / referencia;
  // In the first 3 days one supermarket trip would read as overspending, so it always counts as on pace.
  const estado = dia <= 3 ? "justo" : uso > tiempo + 0.1 ? "rapido" : uso < tiempo - 0.1 ? "holgado" : "justo";
  return { dia, dias, tiempo, uso, estado };
}

export const CASAS_DOLAR = [["bolsa", "MEP"], ["blue", "Blue"], ["oficial", "Oficial"], ["tarjeta", "Tarjeta"]];

// DolarApi's list ([{ casa, venta, fechaActualizacion }]) reduced to the selling price of the rates the app offers.
export function leerDolares(lista) {
  if (!Array.isArray(lista)) throw new Error("No llegaron cotizaciones.");
  const out = {};
  for (const x of lista) {
    if (!CASAS_DOLAR.some(([c]) => c === x?.casa)) continue;
    if (!positivo(x.venta)) continue; // one broken rate should not throw away the others
    out[x.casa] = { venta: x.venta, fecha: String(x.fechaActualizacion ?? "") };
  }
  if (!Object.keys(out).length) throw new Error("No llegaron cotizaciones.");
  return out;
}

// The month that just ended against the one before: total, % change, the category that grew most, hormiga.
export function cierreMes(gastos, y, m) {
  const [s] = serieMensual(gastos, y, m, 1);
  if (!s.total) return null;
  const [prev] = serieMensual(gastos, y, m - 1, 1);
  const sube = compararCategorias(gastos, y, m).reduce((a, r) => r.delta > 0 && (!a || r.delta > a.delta) ? { cat: r.cat, delta: r.delta } : a, null);
  return { total: s.total, anterior: prev.total, pct: prev.total ? Math.round((s.total - prev.total) / prev.total * 100) : null, hormiga: s.hormiga, sube };
}

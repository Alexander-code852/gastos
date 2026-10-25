// Pure logic, no DOM: tested by logic.test.mjs with `node --test`.

// [id, label, hormiga by default]
export const CATS = [
  ["kiosco", "Kiosco", true], ["cafe", "Café", true], ["delivery", "Delivery", true],
  ["comida", "Comida", false], ["super", "Súper", false], ["transporte", "Transporte", false],
  ["salidas", "Salidas", false], ["servicios", "Servicios", false], ["salud", "Salud", false],
  ["ropa", "Ropa", false], ["hogar", "Hogar", false], ["suscripciones", "Suscripciones", false],
  ["otros", "Otros", false],
];
export const CAT = Object.fromEntries(CATS.map(([id, label, h]) => [id, { label, h }]));

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
  const gastos = list.map((g, i) => {
    const monto = typeof g.monto === "number" ? g.monto : parseMonto(g.monto);
    if (!(monto > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(g.fecha ?? "")) throw new Error(`El gasto número ${i + 1} tiene datos inválidos.`);
    const cuotas = Number.isInteger(g.cuotas) && g.cuotas > 1 && g.cuotas <= 60 ? g.cuotas : 1;
    const out = {
      id: typeof g.id === "string" && g.id ? g.id : crypto.randomUUID(),
      monto,
      cat: CAT[g.cat] ? g.cat : "otros",
      medio: MEDIO[g.medio] ? g.medio : "efectivo",
      cuotas,
      nota: String(g.nota ?? "").slice(0, 80),
      fecha: g.fecha,
      hormiga: !!g.hormiga,
      ts: Number.isFinite(g.ts) ? g.ts : Date.now(),
    };
    if (typeof g.fijoId === "string" && g.fijoId) out.fijoId = g.fijoId;
    return out;
  });

  let presupuestos = null;
  if (obj?.presupuestos && typeof obj.presupuestos === "object") {
    const p = obj.presupuestos;
    presupuestos = { cat: {} };
    if (positivo(p.total)) presupuestos.total = p.total;
    if (positivo(p.hormiga)) presupuestos.hormiga = p.hormiga;
    for (const [id, v] of Object.entries(p.cat ?? {})) if (CAT[id] && positivo(v)) presupuestos.cat[id] = v;
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
        cat: CAT[f.cat] ? f.cat : "otros",
        medio: MEDIO[f.medio] ? f.medio : "efectivo",
        dia: f.dia,
        activo: f.activo !== false,
        ultimoMes: f.ultimoMes,
      };
    });
  }
  return { gastos, presupuestos, fijos };
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
export function aCSV(gastos) {
  const rows = [["Fecha", "Monto", "Categoría", "Medio de pago", "Cuotas", "Hormiga", "Nota"]];
  for (const g of [...gastos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    rows.push([g.fecha, String(g.monto).replace(".", ","), CAT[g.cat]?.label ?? g.cat, MEDIO[g.medio] ?? g.medio,
      String(g.cuotas || 1), g.hormiga ? "Sí" : "No", g.nota || ""]);
  }
  return "﻿" + rows.map(r => r.map(csvCell).join(";")).join("\r\n");
}

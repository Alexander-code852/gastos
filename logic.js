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

// Validates an imported backup; returns clean expense objects or throws with a readable message.
export function leerBackup(obj) {
  const list = Array.isArray(obj) ? obj : obj?.gastos;
  if (!Array.isArray(list)) throw new Error("El archivo no es una copia de seguridad de Gastos Hormiga.");
  return list.map((g, i) => {
    const monto = typeof g.monto === "number" ? g.monto : parseMonto(g.monto);
    if (!(monto > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(g.fecha ?? "")) throw new Error(`El gasto número ${i + 1} tiene datos inválidos.`);
    const cuotas = Number.isInteger(g.cuotas) && g.cuotas > 1 && g.cuotas <= 60 ? g.cuotas : 1;
    return {
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
  });
}

const csvCell = v => /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

// Semicolon-separated with decimal comma, which is what Excel in Spanish expects.
export function aCSV(gastos) {
  const rows = [["Fecha", "Monto", "Categoría", "Medio de pago", "Cuotas", "Hormiga", "Nota"]];
  for (const g of [...gastos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    rows.push([g.fecha, String(g.monto).replace(".", ","), CAT[g.cat]?.label ?? g.cat, MEDIO[g.medio] ?? g.medio,
      String(g.cuotas || 1), g.hormiga ? "Sí" : "No", g.nota || ""]);
  }
  return "﻿" + rows.map(r => r.map(csvCell).join(";")).join("\r\n");
}

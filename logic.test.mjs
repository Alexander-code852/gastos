import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMonto, parteCuota, movimientosDelMes, resumen, leerBackup, aCSV,
  estadoPresupuesto, avisoPresupuesto, porDia, fijosPendientes, ultimoMesInicial,
  serieMensual, compararCategorias, escalaY, frecuentes, buscar, leerIPC, aPesosDe, repetirIngresos } from "./logic.js";

test("monthly series ends at the given month, oldest first, across the year", () => {
  const g = [{ id: "a", monto: 1000, fecha: "2026-01-10", cat: "cafe", medio: "mp", hormiga: true },
             { id: "b", monto: 5000, fecha: "2025-12-20", cat: "super", medio: "debito", hormiga: false }];
  const s = serieMensual(g, 2026, 0, 3);
  assert.deepEqual(s.map(x => [x.y, x.m, x.total, x.hormiga]), [[2025, 10, 0, 0], [2025, 11, 5000, 0], [2026, 0, 1000, 1000]]);
});

test("monthly series counts each installment in the month it is paid", () => {
  const g = [{ id: "c", monto: 3000, fecha: "2026-01-15", cuotas: 3, cat: "ropa", medio: "credito", hormiga: false }];
  assert.deepEqual(serieMensual(g, 2026, 3, 4).map(x => x.total), [1000, 1000, 1000, 0]);
});

test("category comparison: this month vs the previous one, biggest first, empty rows dropped", () => {
  const g = [{ id: "1", monto: 2000, fecha: "2026-10-01", cat: "cafe", medio: "mp" },
             { id: "2", monto: 1000, fecha: "2026-09-01", cat: "cafe", medio: "mp" },
             { id: "3", monto: 500, fecha: "2026-09-03", cat: "kiosco", medio: "mp" },
             { id: "4", monto: 9000, fecha: "2026-10-02", cat: "super", medio: "debito" }];
  assert.deepEqual(compararCategorias(g, 2026, 9), [
    { cat: "super", actual: 9000, anterior: 0, delta: 9000 },
    { cat: "cafe", actual: 2000, anterior: 1000, delta: 1000 },
    { cat: "kiosco", actual: 0, anterior: 500, delta: -500 },
  ]);
});

test("y scale rounds up to a clean maximum with evenly spaced ticks", () => {
  assert.deepEqual(escalaY(87000), { max: 100000, ticks: [0, 25000, 50000, 75000, 100000] });
  assert.deepEqual(escalaY(140000), { max: 150000, ticks: [0, 50000, 100000, 150000] });
  assert.deepEqual(escalaY(0), { max: 1000, ticks: [0, 250, 500, 750, 1000] });
});

test("parseMonto", () => {
  assert.equal(parseMonto("1.500"), 1500);
  assert.equal(parseMonto("1500,50"), 1500.5);
  assert.equal(parseMonto("2.5"), 2.5);
  assert.equal(parseMonto("$ 300"), 300);
  for (const bad of ["", "abc", "-3", "0"]) assert.ok(Number.isNaN(parseMonto(bad)), bad);
});

test("cuotas add up to the total", () => {
  const parts = [0, 1, 2].map(k => parteCuota(100, 3, k));
  assert.deepEqual(parts, [33.33, 33.33, 33.34]);
});

test("installments spread across months, crossing the year and clamping the day", () => {
  const g = [{ id: "a", monto: 3000, fecha: "2026-11-30", cuotas: 3, cat: "ropa", medio: "credito" },
             { id: "b", monto: 500, fecha: "2026-12-05", cuotas: 1, cat: "cafe", medio: "efectivo", hormiga: true }];
  assert.equal(movimientosDelMes(g, 2026, 9).length, 0);
  const dic = movimientosDelMes(g, 2026, 11);
  assert.equal(dic.length, 2);
  assert.deepEqual(dic.find(x => x.id === "a"), { ...g[0], fecha: "2026-12-30", monto: 1000, cuota: 2 });
  const feb = movimientosDelMes(g, 2027, 1);
  assert.equal(feb.length, 0);
  const ene = movimientosDelMes(g, 2027, 0);
  assert.equal(ene[0].cuota, 3);
});

test("resumen and annual projection", () => {
  const movs = [{ monto: 1000, hormiga: true, cat: "cafe", medio: "efectivo" },
                { monto: 4000, hormiga: false, cat: "super", medio: "debito" }];
  const r = resumen(movs, 2026, 9, new Date(2026, 9, 10));
  assert.equal(r.total, 5000);
  assert.equal(r.hormiga, 1000);
  assert.equal(r.proyeccionAnual, 36500);
  assert.deepEqual(r.porCat[0], ["super", 4000]);
});

test("leerBackup validates and normalizes", () => {
  const ok = leerBackup({ gastos: [{ id: "x", monto: 10, fecha: "2026-10-01", cat: "nope", medio: "credito", cuotas: 3 }] });
  assert.equal(ok.gastos[0].cat, "otros");
  assert.equal(ok.gastos[0].cuotas, 3);
  assert.throws(() => leerBackup({ foo: 1 }));
  assert.throws(() => leerBackup({ gastos: [{ monto: -1, fecha: "2026-10-01" }] }));
});

test("leerBackup reads a v1 backup without budgets or fixed expenses", () => {
  const r = leerBackup({ app: "gastos-hormiga", version: 1, gastos: [{ id: "a", monto: 5, fecha: "2026-10-01", cat: "cafe" }] });
  assert.equal(r.gastos.length, 1);
  assert.equal(r.presupuestos, null);
  assert.equal(r.fijos, null);
});

test("leerBackup round-trips a v2 backup with budgets and fixed expenses", () => {
  const backup = {
    app: "gastos-hormiga", version: 2,
    gastos: [{ id: "f1:2026-10", monto: 300000, fecha: "2026-10-05", cat: "hogar", medio: "transferencia", fijoId: "f1" }],
    presupuestos: { total: 900000, hormiga: 50000, cat: { kiosco: 20000, inventada: 5, cafe: -3 } },
    fijos: [{ id: "f1", nombre: "Alquiler", monto: 300000, cat: "hogar", medio: "transferencia", dia: 5, activo: true, ultimoMes: "2026-10" }],
  };
  const r = leerBackup(JSON.parse(JSON.stringify(backup)));
  assert.equal(r.gastos[0].fijoId, "f1");
  assert.deepEqual(r.presupuestos, { total: 900000, hormiga: 50000, cat: { kiosco: 20000 } });
  assert.deepEqual(r.fijos, backup.fijos);
});

test("leerBackup rejects a fixed expense with an invalid day", () => {
  assert.throws(() => leerBackup({ gastos: [], fijos: [{ id: "f", nombre: "x", monto: 1, dia: 40, ultimoMes: "2026-10" }] }));
});

test("budget state: under 80% is bien", () => {
  assert.deepEqual(estadoPresupuesto(7000, 10000), { gastado: 7000, limite: 10000, queda: 3000, pct: 0.7, estado: "bien" });
});

test("budget state: 80% up to exactly 100% is cerca", () => {
  assert.equal(estadoPresupuesto(8000, 10000).estado, "cerca");
  assert.equal(estadoPresupuesto(10000, 10000).estado, "cerca");
});

test("budget state: over 100% is pasado with a negative remainder", () => {
  const e = estadoPresupuesto(12500.5, 10000);
  assert.equal(e.estado, "pasado");
  assert.equal(e.queda, -2500.5);
});

test("budget state: no limit means no budget", () => {
  assert.equal(estadoPresupuesto(5000, undefined), null);
  assert.equal(estadoPresupuesto(5000, 0), null);
});

test("budget warning fires when crossing 80%", () => {
  assert.deepEqual(avisoPresupuesto(7000, 8500, 10000), { tipo: "cerca", monto: 1500 });
});

test("budget warning fires when crossing 100%, even from below 80%", () => {
  assert.deepEqual(avisoPresupuesto(5000, 11200, 10000), { tipo: "pasado", monto: 1200 });
});

test("budget warning fires when going over from exactly the limit", () => {
  assert.deepEqual(avisoPresupuesto(10000, 10500, 10000), { tipo: "pasado", monto: 500 });
});

test("budget warning stays quiet when no threshold is crossed", () => {
  assert.equal(avisoPresupuesto(1000, 2000, 10000), null);
  assert.equal(avisoPresupuesto(8500, 9000, 10000), null);
  assert.equal(avisoPresupuesto(11000, 12000, 10000), null);
  assert.equal(avisoPresupuesto(1000, 20000, undefined), null);
});

test("per-day allowance counts today and the remaining days of the current month", () => {
  assert.equal(porDia(21000, 2026, 9, new Date(2026, 9, 25)), 3000);
});

test("per-day allowance is null for past months and when nothing is left", () => {
  assert.equal(porDia(21000, 2026, 8, new Date(2026, 9, 25)), null);
  assert.equal(porDia(-500, 2026, 9, new Date(2026, 9, 25)), null);
});

const alquiler = { id: "f1", nombre: "Alquiler", monto: 300000, cat: "hogar", medio: "transferencia", dia: 5, activo: true, ultimoMes: "2026-09" };

test("fixed expense is generated once its day arrives", () => {
  const r = fijosPendientes([alquiler], new Date(2026, 9, 5));
  assert.equal(r.gastos.length, 1);
  assert.deepEqual({ ...r.gastos[0], ts: 0 }, { id: "f1:2026-10", fijoId: "f1", monto: 300000, cat: "hogar", medio: "transferencia",
    cuotas: 1, nota: "Alquiler", fecha: "2026-10-05", hormiga: false, ts: 0 });
  assert.equal(r.fijos[0].ultimoMes, "2026-10");
});

test("fixed expense waits until its day", () => {
  const r = fijosPendientes([alquiler], new Date(2026, 9, 4));
  assert.equal(r.gastos.length, 0);
  assert.equal(r.fijos[0].ultimoMes, "2026-09");
});

test("fixed expense catches up on every missed month, across the year", () => {
  const r = fijosPendientes([{ ...alquiler, ultimoMes: "2026-11" }], new Date(2027, 1, 10));
  assert.deepEqual(r.gastos.map(g => g.fecha), ["2026-12-05", "2027-01-05", "2027-02-05"]);
  assert.equal(r.fijos[0].ultimoMes, "2027-02");
});

test("day 31 falls on the last day of shorter months", () => {
  const r = fijosPendientes([{ ...alquiler, dia: 31, ultimoMes: "2027-01" }], new Date(2027, 1, 28));
  assert.equal(r.gastos[0].fecha, "2027-02-28");
});

test("running twice on the same day generates nothing new", () => {
  const hoy = new Date(2026, 9, 25);
  const first = fijosPendientes([alquiler], hoy);
  const second = fijosPendientes(first.fijos, hoy);
  assert.equal(second.gastos.length, 0);
});

test("paused fixed expenses generate nothing", () => {
  const r = fijosPendientes([{ ...alquiler, activo: false }], new Date(2026, 9, 25));
  assert.equal(r.gastos.length, 0);
  assert.equal(r.fijos[0].ultimoMes, "2026-09");
});

test("initial month: include this month starts from the previous one", () => {
  assert.equal(ultimoMesInicial(new Date(2026, 0, 10), true), "2025-12");
  assert.equal(ultimoMesInicial(new Date(2026, 0, 10), false), "2026-01");
});

test("CSV neutralizes notes that Excel would run as formulas", () => {
  const csv = aCSV([{ fecha: "2026-10-01", monto: 1, cat: "otros", medio: "efectivo", nota: "=HYPERLINK(\"x\")", hormiga: false }]);
  assert.ok(!/;=HYPERLINK/.test(csv) && !/;"=HYPERLINK/.test(csv));
  assert.match(csv, /'=HYPERLINK/);
});

test("CSV quotes notes with separators", () => {
  const csv = aCSV([{ fecha: "2026-10-01", monto: 1500.5, cat: "cafe", medio: "mp", nota: 'dijo "hola"; chau', hormiga: true }]);
  assert.match(csv, /2026-10-01;1500,5;Café;Mercado Pago;1;Sí;"dijo ""hola""; chau"/);
});

const gx = (id, monto, cat, medio, fecha, extra = {}) => ({ id, ts: Date.parse(fecha + "T12:00"), monto, cat, medio, cuotas: 1, nota: "", fecha, hormiga: false, ...extra });

test("frequent: same category, amount and payment repeated in the last 60 days, most repeated first", () => {
  const hoy = new Date(2026, 9, 25);
  const g = [
    gx("1", 3200, "cafe", "mp", "2026-10-01", { hormiga: true }), gx("2", 3200, "cafe", "mp", "2026-10-10", { hormiga: true }),
    gx("3", 3200, "cafe", "mp", "2026-10-20", { hormiga: true }),
    gx("4", 2500, "kiosco", "efectivo", "2026-10-02"), gx("5", 2500, "kiosco", "efectivo", "2026-10-22"),
    gx("6", 3200, "cafe", "efectivo", "2026-10-05"), // other payment: separate and only once
    gx("7", 9000, "super", "debito", "2026-08-01"), gx("8", 9000, "super", "debito", "2026-08-02"), // older than 60 days
  ];
  const f = frecuentes(g, hoy);
  assert.deepEqual(f.map(x => [x.cat, x.monto, x.medio, x.veces]), [["cafe", 3200, "mp", 3], ["kiosco", 2500, "efectivo", 2]]);
  assert.equal(f[0].hormiga, true);
});

test("frequent: ignores fixed expenses and installment purchases, keeps at most 4, ties go to the most recent", () => {
  const hoy = new Date(2026, 9, 25);
  const g = [];
  for (const [i, c] of ["cafe", "kiosco", "delivery", "comida", "super"].entries())
    g.push(gx(c + "a", 100 + i, c, "mp", "2026-10-01"), gx(c + "b", 100 + i, c, "mp", `2026-10-1${i}`));
  g.push(gx("f1", 50, "servicios", "debito", "2026-10-01", { fijoId: "x" }), gx("f2", 50, "servicios", "debito", "2026-09-01", { fijoId: "x" }));
  g.push(gx("c1", 60, "ropa", "credito", "2026-10-01", { cuotas: 3 }), gx("c2", 60, "ropa", "credito", "2026-10-02", { cuotas: 3 }));
  assert.deepEqual(frecuentes(g, hoy).map(x => x.cat), ["super", "comida", "delivery", "kiosco"]);
  assert.deepEqual(frecuentes([], hoy), []);
});

test("search: note, category or payment label, ignoring case and accents, newest first", () => {
  const g = [
    gx("1", 100, "delivery", "mp", "2026-09-01", { nota: "Rappi pizza" }),
    gx("2", 200, "cafe", "efectivo", "2026-10-03"),
    gx("3", 300, "super", "debito", "2026-10-04", { nota: "rappi turbo" }),
  ];
  assert.deepEqual(buscar(g, "RAPPI").map(x => x.id), ["3", "1"]);
  assert.deepEqual(buscar(g, "cafe").map(x => x.id), ["2"]);
  assert.deepEqual(buscar(g, "débito").map(x => x.id), ["3"]);
  assert.deepEqual(buscar(g, "  ").map(x => x.id), []);
  assert.deepEqual(buscar(g, "xyz"), []);
});

const IPC = [{ fecha: "2026-07-31", valor: 2 }, { fecha: "2026-08-31", valor: 1.5 }, { fecha: "2026-09-30", valor: 1 }];

test("IPC: monthly rates become cumulative levels, the last month is the reference", () => {
  const ipc = leerIPC(IPC);
  assert.equal(ipc.ultimo, "2026-09");
  assert.ok(Math.abs(ipc.niveles["2026-09"] / ipc.niveles["2026-07"] - 1.015 * 1.01) < 1e-12);
  assert.throws(() => leerIPC({ error: "x" }));
  assert.throws(() => leerIPC([]));
  assert.throws(() => leerIPC([{ fecha: "2026-09-30", valor: "dos" }]));
});

test("IPC: amounts move to pesos of the last month; months outside the data are left as they are", () => {
  const ipc = leerIPC(IPC);
  assert.equal(aPesosDe(1000, 2026, 8, ipc), 1000);                     // September is the reference
  assert.equal(aPesosDe(1000, 2026, 7, ipc), 1010);                     // August: +1% in September
  assert.equal(aPesosDe(1000, 2026, 6, ipc), 1025.15);                  // July: 1.015 * 1.01
  assert.equal(aPesosDe(1000, 2026, 9, ipc), 1000);                     // October has no data yet
  assert.equal(aPesosDe(1000, 2026, 3, ipc), 1025.15);                  // before the data: treated as the first month
});

test("repeating income copies last month's entries with new ids, clamping the day", () => {
  const ing = [
    { id: "a", monto: 900000, concepto: "Sueldo", fecha: "2026-01-31", ts: 1 },
    { id: "b", monto: 50000, concepto: "Changa", fecha: "2026-01-10", ts: 2 },
    { id: "c", monto: 1, concepto: "Otro mes", fecha: "2025-12-05", ts: 3 },
  ];
  const r = repetirIngresos(ing, 2026, 1, 99);
  assert.deepEqual(r.map(x => [x.concepto, x.monto, x.fecha, x.ts]), [["Sueldo", 900000, "2026-02-28", 99], ["Changa", 50000, "2026-02-10", 99]]);
  assert.ok(r.every(x => x.id && !["a", "b"].includes(x.id)));
  assert.deepEqual(repetirIngresos(ing, 2026, 0, 99).map(x => x.fecha), ["2026-01-05"]);
  assert.deepEqual(repetirIngresos(ing, 2026, 5, 99), []);
});

test("leerBackup reads income from a v3 backup and leaves it null for older ones", () => {
  const r = leerBackup({ version: 3, gastos: [], ingresos: [{ id: "i", monto: 1000, concepto: "Sueldo", fecha: "2026-10-01", ts: 5 }] });
  assert.deepEqual(r.ingresos, [{ id: "i", monto: 1000, concepto: "Sueldo", fecha: "2026-10-01", ts: 5 }]);
  assert.equal(leerBackup({ version: 2, gastos: [] }).ingresos, null);
  assert.throws(() => leerBackup({ gastos: [], ingresos: [{ monto: 0, fecha: "2026-10-01" }] }));
});

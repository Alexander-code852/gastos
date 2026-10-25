import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMonto, parteCuota, movimientosDelMes, resumen, leerBackup, aCSV,
  estadoPresupuesto, avisoPresupuesto, porDia, fijosPendientes, ultimoMesInicial } from "./logic.js";

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

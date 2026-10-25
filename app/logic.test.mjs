import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMonto, parteCuota, movimientosDelMes, resumen, leerBackup, aCSV } from "./logic.js";

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
  assert.equal(ok[0].cat, "otros");
  assert.equal(ok[0].cuotas, 3);
  assert.throws(() => leerBackup({ foo: 1 }));
  assert.throws(() => leerBackup({ gastos: [{ monto: -1, fecha: "2026-10-01" }] }));
});

test("CSV quotes notes with separators", () => {
  const csv = aCSV([{ fecha: "2026-10-01", monto: 1500.5, cat: "cafe", medio: "mp", nota: 'dijo "hola"; chau', hormiga: true }]);
  assert.match(csv, /2026-10-01;1500,5;Café;Mercado Pago;1;Sí;"dijo ""hola""; chau"/);
});

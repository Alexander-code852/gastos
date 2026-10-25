import { CATS, CAT, MEDIOS, MEDIO, parseMonto, parteCuota, movimientosDelMes, resumen, leerBackup, aCSV } from "./logic.js";

const KEY = "gastos.v1", BACKUP_KEY = "gastos.ultimaCopia";
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const fmt = n => money.format(n);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const monthFmt = { format: d => cap(new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(d)) };
const dayFmt = { format: d => cap(new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short" }).format(d)) };
const $ = id => document.getElementById(id);
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = () => iso(new Date());

// shortcut: the whole list lives in one localStorage key (~5 MB, tens of thousands of expenses); move to IndexedDB if it ever gets close.
let gastos = (() => { try { return JSON.parse(localStorage.getItem(KEY)) ?? []; } catch { return []; } })();
let view = (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();
let cat = "kiosco", medio = "efectivo", editingId = null, undoState = null, toastTimer = 0;

// Writes first, then swaps in memory, so a failed write never shows data that is not saved.
function commit(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); }
  catch { say("No se pudo guardar en el teléfono. Liberá espacio y probá de nuevo.", true); return false; }
  gastos = next;
  render();
  return true;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function chips(box, items, selected, onPick, dotFor) {
  box.replaceChildren(...items.map(([id, label]) => {
    const b = el("button", "chip", label);
    b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(id === selected));
    if (dotFor?.(id)) { const d = el("span", "dot"); d.setAttribute("aria-hidden", "true"); b.append(d); }
    b.onclick = () => onPick(id);
    return b;
  }));
}

function renderForm() {
  chips($("cats"), CATS, cat, id => { cat = id; $("esHormiga").checked = CAT[id].h; renderForm(); }, id => CAT[id].h);
  chips($("medios"), MEDIOS, medio, id => { medio = id; if (id !== "credito") $("cuotas").value = "1"; renderForm(); });
  $("cuotasRow").hidden = medio !== "credito";
  const n = Number($("cuotas").value), monto = parseMonto($("monto").value);
  $("cuotaInfo").textContent = n > 1 && monto > 0 ? `${n} cuotas de ${fmt(parteCuota(monto, n, 0))}` : "";
}

function bars(box, rows, label, isAnt) {
  const max = rows.length ? rows[0][1] : 1;
  box.replaceChildren(...(rows.length ? rows.map(([id, v]) => {
    const r = el("div", "bar" + (isAnt?.(id) ? " ant" : ""));
    const track = el("div", "track"), fill = el("div", "fill");
    fill.style.width = `${Math.max(2, v / max * 100)}%`;
    track.append(fill);
    r.append(el("span", null, label(id)), el("span", "num", fmt(v)), track);
    return r;
  }) : [el("p", "empty", "Sin gastos todavía.")]));
}

function render() {
  const mesTxt = monthFmt.format(new Date(view.y, view.m, 1));
  $("mes").textContent = mesTxt;
  const movs = movimientosDelMes(gastos, view.y, view.m);
  const r = resumen(movs, view.y, view.m);
  $("total").textContent = fmt(r.total);
  $("hTotal").textContent = fmt(r.hormiga);
  $("hPct").textContent = r.total ? `${Math.round(r.hormiga / r.total * 100)}% del total` : "";
  const proy = $("proy");
  proy.replaceChildren();
  if (r.proyeccionAnual) proy.append(r.isCurrent ? "A este ritmo, tus gastos hormiga suman " : "A ese ritmo, los gastos hormiga sumarían ",
    el("strong", null, fmt(r.proyeccionAnual)), " al año.");

  bars($("porCat"), r.porCat, id => CAT[id]?.label ?? id, id => CAT[id]?.h);
  bars($("porMedio"), r.porMedio, id => MEDIO[id] ?? id);

  const byDay = {};
  for (const g of movs) (byDay[g.fecha] ||= []).push(g);
  const dias = Object.keys(byDay).sort().reverse();
  $("lista").replaceChildren(...(dias.length ? dias.map(f => {
    const items = byDay[f].sort((a, b) => b.ts - a.ts);
    const box = el("div", "dia");
    const h = el("div", "dia-h");
    h.append(el("span", null, dayFmt.format(new Date(f + "T12:00"))), el("span", "num", fmt(items.reduce((s, g) => s + g.monto, 0))));
    box.append(h, ...items.map(g => {
      const row = el("div", "item");
      const edit = el("button", "edit");
      edit.type = "button";
      const what = el("span", "what");
      what.append(el("span", "cat", CAT[g.cat]?.label ?? g.cat));
      if (g.hormiga) what.append(el("span", "tag", "hormiga"));
      const meta = [MEDIO[g.medio], g.cuota ? `cuota ${g.cuota}/${g.cuotas}` : "", g.nota].filter(Boolean).join(" · ");
      if (meta) what.append(el("span", "meta", meta));
      edit.append(what, el("span", "num", fmt(g.monto)));
      edit.setAttribute("aria-label", `Editar ${CAT[g.cat]?.label ?? g.cat} ${fmt(g.monto)}`);
      edit.onclick = () => startEdit(g.id);
      const del = el("button", "del", "Borrar");
      del.type = "button"; del.setAttribute("aria-label", `Borrar ${CAT[g.cat]?.label ?? g.cat} ${fmt(g.monto)}`);
      del.onclick = () => borrar(g.id);
      row.append(edit, del);
      return row;
    }));
    return box;
  }) : [el("p", "empty", `No hay gastos en ${mesTxt.toLowerCase()}. Cargá el primero arriba.`)]));

  const last = Number(localStorage.getItem(BACKUP_KEY)) || 0;
  const dias14 = (Date.now() - last) / 864e5;
  $("banner").hidden = !gastos.length || dias14 < 14;
  $("bannerTxt").textContent = last ? `Hace ${Math.floor(dias14)} días que no guardás una copia.` : "Todavía no guardaste una copia de tus gastos.";
}

function say(text, err) { const m = $("msg"); m.textContent = text; m.classList.toggle("err", !!err); }

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
  const g = gastos.find(x => x.id === id);
  if (!g) return;
  editingId = id;
  cat = g.cat; medio = g.medio;
  $("monto").value = String(g.monto).replace(".", ",");
  $("nota").value = g.nota || "";
  $("fecha").value = g.fecha;
  $("cuotas").value = String(g.cuotas || 1);
  $("esHormiga").checked = !!g.hormiga;
  $("form").classList.add("editing");
  $("formTitle").textContent = g.cuotas > 1 ? `Editar compra en ${g.cuotas} cuotas (monto total)` : "Editar gasto";
  $("guardar").textContent = "Guardar cambios";
  $("cancelar").hidden = false;
  say("");
  renderForm();
  $("form").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showToast(text) {
  $("toastTxt").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $("toast").hidden = true; undoState = null; }, 6000);
}

function borrar(id) {
  const g = gastos.find(x => x.id === id);
  const prev = gastos;
  if (!g || !commit(gastos.filter(x => x.id !== id))) return;
  if (editingId === id) resetForm();
  undoState = prev;
  showToast(g.cuotas > 1 ? `Borraste la compra en ${g.cuotas} cuotas` : `Borraste ${fmt(g.monto)}`);
}

$("undo").onclick = () => {
  if (!undoState) return;
  $("toast").hidden = true;
  commit(undoState);
  undoState = null;
};

$("form").addEventListener("submit", ev => {
  ev.preventDefault();
  const monto = parseMonto($("monto").value);
  if (isNaN(monto)) { say("Escribí un monto mayor a cero, por ejemplo 1500 o 1.500,50.", true); $("monto").focus(); return; }
  const fecha = $("fecha").value || today();
  const data = { monto, cat, medio, cuotas: medio === "credito" ? Number($("cuotas").value) : 1,
    nota: $("nota").value.trim(), fecha, hormiga: $("esHormiga").checked };
  const wasEditing = editingId;
  const next = wasEditing
    ? gastos.map(g => g.id === wasEditing ? { ...g, ...data } : g)
    : [...gastos, { id: crypto.randomUUID(), ts: Date.now(), ...data }];
  if (!commit(next)) return;
  const [y, m] = fecha.split("-").map(Number);
  const otroMes = y !== view.y || m - 1 !== view.m;
  resetForm();
  say(wasEditing ? "Cambios guardados." : otroMes ? `Guardado en ${monthFmt.format(new Date(fecha + "T12:00")).toLowerCase()}.` : `Guardado: ${fmt(monto)} en ${CAT[cat].label}.`);
  if (!wasEditing) $("monto").focus();
});

$("cancelar").onclick = () => { resetForm(); say(""); };
$("monto").addEventListener("input", renderForm);
$("cuotas").addEventListener("change", renderForm);
$("prev").onclick = () => { view = view.m ? { y: view.y, m: view.m - 1 } : { y: view.y - 1, m: 11 }; render(); };
$("next").onclick = () => { view = view.m < 11 ? { y: view.y, m: view.m + 1 } : { y: view.y + 1, m: 0 }; render(); };

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
  const json = JSON.stringify({ app: "gastos-hormiga", version: 1, exportado: new Date().toISOString(), gastos }, null, 1);
  if (await guardarArchivo(`gastos-${today()}.json`, json, "application/json")) {
    try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch {}
    render();
    say("Copia guardada.");
  }
}
$("exportar").onclick = exportar;
$("bannerBtn").onclick = exportar;
$("csv").onclick = () => guardarArchivo(`gastos-${today()}.csv`, aCSV(gastos), "text/csv");

$("importar").addEventListener("change", async ev => {
  const file = ev.target.files?.[0];
  ev.target.value = "";
  if (!file) return;
  try {
    const nuevos = leerBackup(JSON.parse(await file.text()));
    const byId = new Map(gastos.map(g => [g.id, g]));
    for (const g of nuevos) byId.set(g.id, g);
    if (commit([...byId.values()])) say(`Restauraste ${nuevos.length} gastos.`);
  } catch (e) {
    say(e instanceof SyntaxError ? "Ese archivo no es una copia de seguridad válida." : e.message, true);
  }
  $("form").scrollIntoView({ block: "start" });
});

$("fecha").value = today();
$("esHormiga").checked = CAT[cat].h;
renderForm();
render();

navigator.storage?.persist?.();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

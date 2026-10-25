# Tareas: presupuestos y gastos fijos

## Fase 1: navegación
- [ ] **1. Barra de pestañas** (S: index.html, style.css, app.js)
  - Acepta: Gastos, Presupuestos, Fijos y Copia; la sección de copia se mueve a su pestaña; se recuerda la pestaña elegida; la barra respeta la zona inferior del iPhone.
  - Verifica: Edge a 375 px sin desborde; tests en verde.

## Fase 2: presupuestos
- [ ] **2. Lógica de presupuestos** (XS: logic.js, logic.test.mjs)
  - Acepta: `estadoPresupuesto(gastado, limite)` devuelve bien, cerca o pasado con lo que queda; `avisoPresupuesto(antes, despues, limite, nombre)` devuelve el texto solo al cruzar el 80 % o el 100 %.
  - Verifica: `node --test app/logic.test.mjs`.
- [ ] **3. Interfaz de presupuestos** (M: index.html, style.css, app.js)
  - Acepta: editar o quitar el presupuesto total, el hormiga y el de cada categoría; arriba en Gastos se ve lo que queda del total y del hormiga más el monto por día; avisos al guardar un gasto.
  - Verifica: cargar gastos de prueba que crucen el 80 % y el 100 %.

### Punto de control A: tests en verde, presupuestos funcionando de punta a punta

## Fase 3: gastos fijos
- [ ] **4. Lógica de fijos** (XS: logic.js, logic.test.mjs)
  - Acepta: `fijosPendientes(fijos, hoy)` devuelve los gastos a crear y el `ultimoMes` nuevo; maneja el día 31 en febrero, varios meses pendientes, fijos pausados y llamadas repetidas sin duplicar.
  - Verifica: tests.
- [ ] **5. Interfaz de fijos** (M: index.html, style.css, app.js)
  - Acepta: crear, editar, pausar o reanudar y borrar fijos; "Cargarlo también este mes"; total mensual de fijos; se generan al abrir la app; etiqueta "fijo" en los movimientos.
  - Verifica: crear un fijo con día ya pasado y verlo aparecer; borrar el gasto y recargar sin que vuelva.
- [ ] **6. Copia v2** (S: logic.js, logic.test.mjs, app.js)
  - Acepta: exporta gastos, presupuestos y fijos; restaura copias v2 y v1.
  - Verifica: tests de ida y vuelta y de v1.

### Punto de control B: todos los criterios de SPEC.md
- [ ] **7. Revisión y publicación**: revisión de código con la skill, Edge a 375 px en claro y oscuro, subir `VERSION` en `sw.js`, publicar y comprobar que todos los archivos respondan 200.

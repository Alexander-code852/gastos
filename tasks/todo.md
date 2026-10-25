# Tareas: presupuestos y gastos fijos

## Fase 1: navegación
- [x] **1. Barra de pestañas** (S: index.html, style.css, app.js)
  - Acepta: Gastos, Presupuestos, Fijos y Copia; la sección de copia se mueve a su pestaña; se recuerda la pestaña elegida; la barra respeta la zona inferior del iPhone.
  - Verifica: Edge a 375 px sin desborde; tests en verde.

## Fase 2: presupuestos
- [x] **2. Lógica de presupuestos** (XS: logic.js, logic.test.mjs)
  - Acepta: `estadoPresupuesto(gastado, limite)` devuelve bien, cerca o pasado con lo que queda; `avisoPresupuesto(antes, despues, limite, nombre)` devuelve el texto solo al cruzar el 80 % o el 100 %.
  - Verifica: `node --test app/logic.test.mjs`.
- [x] **3. Interfaz de presupuestos** (M: index.html, style.css, app.js)
  - Acepta: editar o quitar el presupuesto total, el hormiga y el de cada categoría; arriba en Gastos se ve lo que queda del total y del hormiga más el monto por día; avisos al guardar un gasto.
  - Verifica: cargar gastos de prueba que crucen el 80 % y el 100 %.

### Punto de control A: tests en verde, presupuestos funcionando de punta a punta

## Fase 3: gastos fijos
- [x] **4. Lógica de fijos** (XS: logic.js, logic.test.mjs)
  - Acepta: `fijosPendientes(fijos, hoy)` devuelve los gastos a crear y el `ultimoMes` nuevo; maneja el día 31 en febrero, varios meses pendientes, fijos pausados y llamadas repetidas sin duplicar.
  - Verifica: tests.
- [x] **5. Interfaz de fijos** (M: index.html, style.css, app.js)
  - Acepta: crear, editar, pausar o reanudar y borrar fijos; "Cargarlo también este mes"; total mensual de fijos; se generan al abrir la app; etiqueta "fijo" en los movimientos.
  - Verifica: crear un fijo con día ya pasado y verlo aparecer; borrar el gasto y recargar sin que vuelva.
- [x] **6. Copia v2** (S: logic.js, logic.test.mjs, app.js)
  - Acepta: exporta gastos, presupuestos y fijos; restaura copias v2 y v1.
  - Verifica: tests de ida y vuelta y de v1.

### Punto de control B: todos los criterios de SPEC.md
- [x] **7. Revisión y publicación**: revisión de código con la skill, Edge a 375 px en claro y oscuro, subir `VERSION` en `sw.js`, publicar y comprobar que todos los archivos respondan 200.

## Etapa 3
- [x] **8. Lógica** (S: logic.js, logic.test.mjs): `frecuentes(gastos, hoy)` y `buscar(gastos, texto)` con tests.
- [x] **9. Frecuentes en la interfaz** (S: index.html, style.css, app.js): un toque guarda, con Deshacer y avisos.
- [x] **10. Búsqueda en la interfaz** (S: index.html, style.css, app.js): lupa, resultados por mes con total, tocar edita.
- [x] **11. Ícono** (XS: íconos PNG): generado desde un SVG con Chrome sin ventana.
- [x] **12. Revisión y publicación.**

## Etapa 4
- [x] **13. Lógica** (S: logic.js, logic.test.mjs): `leerIPC`, `aPesosDe`, `repetirIngresos`, copia v3.
- [x] **14. Ingresos en la interfaz** (M: index.html, style.css, app.js).
- [x] **15. Inflación en Meses** (S: index.html, app.js).
- [x] **16. Revisión y publicación.**

## Etapa 5
- [x] **17. Deslizar para borrar** (S: app.js, style.css).
- [x] **18. Panel de detalle por categoría** (M: index.html, style.css, app.js).
- [x] **19. Revisión y publicación.**

## Etapa 6
- [x] **20. Lógica** (S: logic.js, logic.test.mjs): `evaluarMonto(texto)` (sumas con +, coma decimal, puntos de miles; inválido → NaN) y `gastoPorDia(movs, y, m)` (total por día del mes).
- [x] **21. Íconos de categoría** (S: app.js, style.css): `catIcon(id)` con SVG por categoría por defecto e inicial para las propias; en Movimientos, Por categoría, frecuentes y detalle.
- [x] **22. Panel de carga nuevo** (M: index.html, style.css, app.js): selector Gasto/Ingreso, teclado propio con +, grilla de categorías, fecha en chips, guardar fijo con monto, "Repetir hoy"; el formulario de ingreso de la tarjeta se va. Botón + nuevo que gira a ×.
  - Verifica: cargar un gasto con "1500+800" y un ingreso desde el +; editar y repetir hoy.
- [x] **23. Calendario del mes** (S: index.html, style.css, app.js): escala validada con dataviz; tocar un día lleva a ese día en Movimientos.
- [x] **24. Revisión y publicación**: skill de revisión, capturas a 375 px claro y oscuro, `VERSION`, publicar, comprobar 200.

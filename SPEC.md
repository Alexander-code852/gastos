# Spec: Presupuestos y gastos fijos — Gastos Hormiga

## Objetivo

Que el usuario (una persona, iPhone, pesos argentinos) sepa **antes de pasarse** cuánto le queda para gastar en el mes, y que no tenga que cargar a mano todos los meses lo que paga siempre (alquiler, servicios, suscripciones).

### Presupuestos
- Un monto mensual opcional **por categoría**, uno para **gastos hormiga** y uno **total del mes**. Se repiten igual todos los meses hasta que se cambien.
- Lo gastado cuenta todo lo del mes visible, cuotas incluidas (lo mismo que ya muestra "Por categoría").
- Estado de cada presupuesto: **bien** (< 80 %), **cerca** (80–100 %), **pasado** (> 100 %). Se ve con color y texto, no solo color.
- Al guardar un gasto que cruza el 80 % o el 100 % de su categoría, hormiga o total, el mensaje lo dice: "Te quedan $ 2.300 en Kiosco" / "Te pasaste $ 1.200 del presupuesto hormiga".
- La pantalla principal muestra cuánto queda del presupuesto total y cuánto por día hasta fin de mes.

### Gastos fijos
- Un gasto fijo tiene: nombre, monto, categoría, medio de pago y **día del mes** (1–31; si el mes es más corto, se usa el último día).
- Al abrir la app, por cada fijo activo se crea el gasto de cada mes que ya llegó a su día y todavía no se generó. Si la app no se abrió por dos meses, se crean los dos.
- El gasto creado es un gasto común: se edita o borra como cualquiera, lleva la etiqueta "fijo" y **borrarlo no hace que se vuelva a crear**.
- Al crear un fijo, la opción "Cargarlo también este mes" (activada por defecto) decide si el mes actual cuenta. Así no se duplica lo que ya cargaste a mano.
- Editar un fijo afecta solo a los meses que vienen. Pausarlo o borrarlo no toca los gastos ya creados.
- Se ve el total mensual de fijos.

### Navegación
La pantalla única ya es larga, así que se agrega una **barra de pestañas abajo**, como en las apps de iPhone: **Gastos** (lo actual), **Presupuestos**, **Fijos** y **Copia** (copia de seguridad y Excel).

### Gráficos mes a mes (agregado 2026-10-25)
- Nueva pestaña **Meses**, entre Presupuestos y Fijos. El rango termina en el mes elegido arriba y se puede ver **6 o 12 meses**.
- Arriba, dos números: **promedio por mes** y **mes más alto** del rango.
- **Columnas apiladas** por mes: gastos hormiga y resto, con una línea para el presupuesto total si existe. Las cuotas cuentan en el mes en que se pagan, igual que en el resto de la app.
- Tocar o enfocar una columna muestra el mes, el total, lo hormiga y el resto. Los mismos datos se pueden ver como tabla.
- Una **tabla por categoría** con este mes, el anterior y la diferencia (con flecha y signo, no solo color).
- Colores validados con el script de la skill dataviz: claro `#e0621f` / `#13a07a`, oscuro `#e2702f` / `#24a87c`.

## Supuestos
1. El presupuesto es el mismo todos los meses; no hay presupuestos distintos por mes.
2. El monto de un fijo es fijo; si un servicio vino distinto, se edita el gasto de ese mes.
3. Los fijos no tienen cuotas.
4. La copia de seguridad pasa a incluir presupuestos y fijos (formato versión 2), y "Restaurar" sigue aceptando copias de la versión 1.
5. Sin notificaciones: en iPhone requieren un servidor.

## Stack
HTML, CSS y JavaScript sin dependencias ni compilación. Datos en `localStorage`: `gastos.v1` (ya existe), `gastos.presupuestos` y `gastos.fijos`. Funciona sin internet mediante el service worker.

## Comandos
```
Tests:    node --test app/logic.test.mjs
Local:    npx -y http-server@14.1.1 app -p 8765 -c-1
Publicar: git push && git subtree push --prefix app origin gh-pages
```

## Estructura
```
app/logic.js          lógica pura (sin DOM): cálculos, validación, generación de fijos
app/logic.test.mjs    tests de logic.js
app/app.js            interfaz y almacenamiento
app/index.html, style.css, sw.js, manifest.webmanifest, íconos
```

## Estilo
Igual que el código existente: funciones puras exportadas desde `logic.js`, DOM armado con `el()`, textos de interfaz en español rioplatense, comentarios solo para explicar el porqué.

```js
// Months whose day has arrived and were not generated yet; deleting a generated expense never brings it back.
export function fijosPendientes(fijos, hoy) { ... }
```

## Tests
- Cada función nueva de `logic.js` tiene tests en `logic.test.mjs` antes de conectarla a la interfaz: estados de presupuesto, cruces de 80 % y 100 %, generación de fijos (día 31 en febrero, varios meses pendientes, fijo pausado, sin duplicados) y lectura de copias v1 y v2.
- La interfaz se revisa en Edge a 375 px, en modo claro y oscuro, sin desborde horizontal.

## Límites
- **Siempre:** tests en verde antes de cada commit; subir `VERSION` en `sw.js` en cada publicación; nunca perder datos (escribir primero y actualizar la pantalla después, como ya hace `commit()`).
- **Preguntar antes:** agregar dependencias o cambiar dónde se guardan los datos.
- **Nunca:** borrar ni modificar gastos existentes al migrar; publicar con tests fallando.

## Criterios de éxito
- [x] Se puede definir, cambiar y quitar un presupuesto por categoría, uno hormiga y uno total.
- [x] Cada presupuesto muestra lo gastado, lo que queda o el exceso, y su estado.
- [x] Guardar un gasto que cruza el 80 % o el 100 % lo avisa en el mensaje.
- [x] Un fijo con día 31 genera el 28 o 29 en febrero.
- [x] Abrir la app después de dos meses sin usarla genera los dos meses que faltaban, sin duplicar.
- [x] Un gasto fijo borrado no vuelve a aparecer.
- [x] Una copia exportada y restaurada conserva gastos, presupuestos y fijos; una copia vieja (v1) se restaura sin error.
- [x] Los datos del usuario se mantienen después de actualizar.
- [x] Tests en verde y sin desborde a 375 px.

## Decisiones (aprobado 2026-10-25)
1. Barra de pestañas abajo: Gastos, Presupuestos, Fijos y Copia.
2. El presupuesto total y el de hormiga se muestran arriba en la pestaña Gastos (lo que queda y cuánto por día). La pestaña Presupuestos es para editarlos y ver el detalle por categoría.

## Etapa 3: ícono, frecuentes y búsqueda (aprobado 2026-10-25)
- **Ícono:** nuevo ícono con la paleta del rediseño (verde `#12382b`, crema `#f4f1ea`, naranja hormiga), en 192, 512 (maskable, dibujo dentro del 80 % central) y 180 para iPhone.
- **Frecuentes:** arriba del formulario, hasta 4 botones con los gastos que más repetiste en los últimos 60 días (misma categoría, monto y medio de pago, al menos 2 veces; sin fijos ni compras en cuotas). Un toque lo guarda con la fecha de hoy y muestra el aviso con "Deshacer" y los avisos de presupuesto.
- **Búsqueda:** una lupa en Movimientos que busca en todos los meses por nota, categoría o medio de pago, sin importar mayúsculas ni acentos. Muestra los resultados agrupados por mes y el total encontrado; tocar uno lo edita.
- **Éxito:** tests de `frecuentes()` y `buscar()` en verde; sin desborde a 375 px en claro y oscuro; `VERSION` subida.

# Plan: presupuestos y gastos fijos

Basado en `SPEC.md` (aprobado 2026-10-25). Tareas en `tasks/todo.md`.

## Decisiones de arquitectura
- **Toda regla nueva va en `logic.js` como función pura y con tests** (`estadoPresupuesto`, `avisoPresupuesto`, `fijosPendientes`, `leerBackup` v2). `app.js` solo conecta la interfaz y el almacenamiento.
- **Datos:** `gastos.presupuestos` = `{ total?, hormiga?, cat: { kiosco: 20000, … } }`; `gastos.fijos` = `[{ id, nombre, monto, cat, medio, dia, activo, ultimoMes: "YYYY-MM" }]`. Cada gasto generado lleva `fijoId`.
- **Sin duplicados en los fijos:** cada fijo guarda `ultimoMes`, el último mes ya generado. Solo se generan los meses posteriores cuyo día ya llegó. Por eso borrar un gasto generado no lo hace volver.
- **Guardado:** se generaliza el `commit()` actual para escribir varias claves; si falla la escritura, no cambia nada en memoria.
- **Pestañas:** se usan `hidden` sobre cuatro `<section>` y un `<nav>` fijo abajo, sin router. La pestaña elegida se recuerda en `localStorage`.

## Grafo de dependencias
```
pestañas ──┬── presupuestos (lógica → interfaz)
           ├── fijos (lógica → interfaz)
           └── copia v2 (necesita presupuestos y fijos)
                    └── revisión visual, versión del SW, publicar
```

## Riesgos
| Riesgo | Impacto | Mitigación |
|---|---|---|
| Un fijo generado dos veces (dos pestañas abiertas o doble apertura) | Medio | `ultimoMes` se escribe en el mismo `commit` que los gastos generados |
| El iPhone sigue mostrando la versión vieja | Medio | Subir `VERSION` en `sw.js` |
| Copia v1 incompatible | Alto | Test explícito de restauración de una copia v1 |
| La barra de abajo tapa el contenido o la barra de inicio del iPhone | Bajo | Padding con `env(safe-area-inset-bottom)` y revisión a 375 px |

# Resultados de los casos de prueba — 26/10/2026

Corridos en DEV (sitio local + servidor + tienda demo + ERP de prueba local + panel). Pedidos de prueba: **#132 a #139** en la tienda demo. Además: pruebas automáticas y chequeos del DEV en línea.

**Resumen: todo pasó. 2 errores encontrados y corregidos (encabezado en celular y mensaje de WhatsApp de Pedidos WEB).**

## Errores encontrados (corregidos)

| Caso | Problema | Corrección |
|---|---|---|
| A9 / L2 | En el celular, con el logo nuevo y el botón "Ingresar", el **botón del carrito quedaba cortado** a la derecha del encabezado. | En pantallas chicas se muestra solo la jirafa (ya dice "Pañalera Mayorista"). Verificado a 375 px: todo entra. Publicado en línea. |
| M5 | El WhatsApp armado de Pedidos WEB decía **"tenemos todo en stock"** aunque los productos estaban "Sin conteo". | Solo lo dice si el stock está contado y alcanza; si no, mensaje neutro con el total. Publicado en el ERP en línea. |

## Resultados por caso

| Sección | Resultado |
|---|---|
| Automáticas | ✅ sitio-api 25/25 · ERP (relacionadas) 49/49 · tipos del ERP sin errores |
| A. Catálogo | ✅ 509 productos, 8 rubros, sin costos (la casilla "Ver costos" de la maqueta existe en el código pero queda oculta y no hay costos en los datos), unidades correctas, celular sin desplazamiento horizontal (después de la corrección) |
| B. Carrito | ✅ Mínimo $50.000 (botón bloqueado/habilitado), transferencia +5% exacto |
| C. Checkout | ✅ C6 retiro y C7 envío creados; C9 nota del cliente llega al ERP. Validaciones de campos y teléfonos: pruebas automáticas |
| D. Seguimiento | ✅ link abre el pedido; alterado no abre; un link no abre otro pedido; sin teléfono ni dirección |
| E. Retiro (#132) | ✅ Recibido → En revisión → Confirmado → En preparación → Listo → Pagado → Entregado, igual en ERP y cliente |
| F. Envío (#133) | ✅ no sale sin cobrar; En camino → Entregado |
| G. Cancelaciones | ✅ G1 (#134) se cancela solo · G2 (#135) solo pedido + marca · G3 (#136) cobrado → solo pedido · G4 (#137) "Devolución en curso" · G5–G7 (#138) en reparto: cliente no puede (409), entrega bloqueada, "volvió al local" cierra. G8–G9 (cancelar desde el panel de la tienda demo) no se repitieron: requieren incógnito y no cambió ese código |
| H. ERP | ✅ pendientes del equipo en el inicio; marcas en listas; avisos a Tiendanube: 124 enviados, 1 omitido, 0 fallidos |
| I. Google | ✅ página de producto (agregar, noindex, logo), rubro, pie con 8 rubros, sitemap 518, robots bloquea |
| J. Raros | ✅ J3 3 pedidos mismo teléfono → 1 ficha · J4 4.º pedido del mismo teléfono rechazado · J6 6.º pedido de la misma conexión frenado |
| K. Cuentas | ✅ en vivo contra la tienda demo (#139): ficha del cliente creada, pedido con sesión sale con el e-mail de la cuenta, Tiendanube lo enlaza a la ficha, aparece en "Mis pedidos". El ingreso real con Google lo probó Gastón en línea (26/10) |
| L. Cotización y logo | ✅ cotización imprimible; logo, favicon e íconos |
| M. Pedidos WEB | ✅ estados correctos de #132–#139 (Entregado, Cancelado, Listo/Confirmado con "pidió cancelar", Revisar stock); confirmar (#112, día anterior) y cancelar (#139) desde la pestaña; el cliente ve el cambio; link a la tienda demo; sincronizar catálogo (39 incorporados, local y en línea) |
| En línea | ✅ sitio, ERP y panel piden contraseña (401 sin ella) |

## Pendientes (no son errores)
- Quitar de la portada el código sobrante de la maqueta ("Ver costos (interno)") antes de producción.
- Los productos del ERP de prueba no tienen stock contado: Pedidos WEB muestra "Sin conteo" casi siempre.

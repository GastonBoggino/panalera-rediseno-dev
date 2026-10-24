# Resultados de los casos de prueba — 24/10/2026

Corridos uno por uno en DEV (sitio local + servidor + tienda demo + ERP de prueba local + panel). Pedidos de prueba usados: #116 a #127 en la tienda demo.

**Resumen: 2 errores encontrados y corregidos; el resto pasó.**

## Errores encontrados (corregidos)

| Caso | Problema | Corrección | Verificado |
|---|---|---|---|
| A5 | En productos como "OLEO PAEZ X500" o "ALGODON X500" el "X500" (ml o gramos) se tomaba como **500 unidades** → "500 unidades · $7 c/u". También en desodorantes, shampoo, etc. | El "x N" solo cuenta como unidades en productos que se venden por unidad (toallitas, pañales, apósitos, protectores, discos, hisopos, bolsas…). Los talles de pañales ("G60", "XG52") siguen igual. | Pruebas automáticas (sitio-api 12/12); catálogo: 156 productos con unidades, todos pañales/toallitas/apósitos/hisopos; la página del óleo ya no dice "unidades" |
| C9 | La nota del pedido (forma de pago elegida y nota del cliente) llegaba a Tiendanube pero **el ERP no la importaba**: el local no veía si el cliente eligió transferencia ni lo que escribió. | El ERP importa la nota: completa la **forma de pago** del pedido (si no hay una cargada) y agrega "Nota del cliente: …" al detalle de entrega. | Prueba automática nueva (ERP); pedido #117: forma de pago "Transferencia" y nota visible en el ERP |

**Pendiente relacionado:** el mismo error de unidades está en el código del plan A (plantilla Ipanema de Tiendanube, `piloto-codigo`).

## Resultados por caso

| Sección | Casos | Resultado |
|---|---|---|
| A. Catálogo | A1–A8 | ✅ (A5 con el error de unidades, corregido) |
| B. Carrito | B1–B4 | ✅ |
| C. Checkout | C1–C11 | ✅ (C9 con el error de la nota, corregido). C3 teléfonos: "0341 15 555-0102" y "+54 9 341 555 0103" llegan como 3415550102 / 3415550103. C8 expreso: verificado el resumen, sin pedido real. |
| D. Seguimiento | D1–D5 | ✅ Link alterado → error; el link de un pedido no abre otro; sin teléfono ni dirección; se actualizó solo en 11 s. |
| E. Retiro | E1–E8 | ✅ Cada paso del ERP coincide con lo que ve el cliente (#116). |
| F. Envío | F1–F4 | ✅ El ERP no deja salir sin cobro; en camino → entregado (#117). |
| G. Cancelaciones | G1–G9 | ✅ G1 (#118) se cancela solo · G2 (#119) solo pedido + tarea · G3 (#124) cobrado → solo pedido · G4 (#121) cancelado con "Devolución en curso" · G5–G7 (#122) en reparto: cliente no puede cancelar (409), entrega bloqueada, "volvió al local" cierra · G8–G9 (#123) cancelado en la tienda demo en reparto → tarea + "volver al local", sin doble cancelación. |
| H. ERP | H1–H3 | ✅ 14 tareas pendientes en el inicio; marcas "volver al local" y "pidió cancelar"; avisos: 90 enviados, 1 omitido. |
| I. Google | I1–I5 | ✅ (I2 verificado el 23/10, sin cambios). |
| J. Raros | J1–J5 | ✅ J3 (#125–#127) mismo teléfono → una sola ficha de cliente · J4: 4.º pedido del mismo teléfono rechazado. |

## Aprendido
- El **límite de 5 pedidos cada 10 minutos por conexión** sí se puede probar en local (wrangler simula la IP): se disparó durante las pruebas. Corregido en el documento de casos.
- En un pedido con mismo teléfono y distinto nombre, el ERP conserva el nombre de la primera ficha (regla existente del ERP).

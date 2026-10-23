# Casos de prueba — sitio propio + Tiendanube demo + ERP de prueba

Todo es DEV: los pedidos se crean de verdad en la **tienda demo** (Pañalera Rediseño DEV) y en el **ERP de prueba local**. No toca la tienda real ni producción. **Usá datos inventados** (nombres de prueba, teléfonos tipo 341 555-0xxx).

## Antes de empezar

| Qué | Dirección |
|---|---|
| Sitio (cliente) | http://localhost:8787 |
| ERP de prueba (local) | http://localhost:8790 · usuario **Samu Pereyra** · PIN **3333** |
| Panel de pruebas | http://127.0.0.1:8791 |

- Si el sitio se ve viejo, recargá la página.
- Después de hacer un pedido en el sitio, en el panel tocá **"Importar pedidos web"** para que llegue al ERP.
- El seguimiento del cliente se actualiza solo cada 15 segundos (o con "Actualizar estado").
- Anotá en cada caso: ✅ funcionó · ❌ falló (y qué viste).

---

## A. Catálogo y navegación (sitio)

- [ ] **A1. Carga del catálogo.** Abrí el sitio. → Aparecen los productos con foto, marca, nombre, precio, unidades y precio por unidad. En "Comprá por categoría" se ven los rubros con su cantidad.
- [ ] **A2. Rubros.** Tocá cada rubro (Pañales, Cambio de pañal, Hora del baño, etc.). → Se filtra la lista y el contador muestra la cantidad correcta.
- [ ] **A3. Talles.** En Pañales, tocá un talle (G, XG…). → Solo quedan pañales de ese talle.
- [ ] **A4. Buscador.** Buscá "huggies", "XG52", "colonia". → Aparecen los productos que coinciden. Buscá algo que no exista. → Mensaje "No encontramos productos…".
- [ ] **A5. Orden.** Ordená por "Precio por unidad", "Menor precio" y "Mayor precio". → La lista se reordena.
- [ ] **A6. Vista lista.** Cambiá a "Lista". → Filas compactas con talle, unidades, precio por unidad y precio.
- [ ] **A7. Mostrar más.** Bajá hasta el final y tocá "Mostrar más productos". → Se cargan más.
- [ ] **A8. Sin costos.** Clic derecho → "Ver código fuente" y buscá la palabra `cost`. → No aparece ningún costo. No hay casilla "Ver costos".
- [ ] **A9. Celular.** Abrí el sitio en el celular o achicá la ventana. → No hay desplazamiento horizontal; el carrito queda fijo abajo; los textos se leen bien.

## B. Carrito

- [ ] **B1. Agregar y quitar.** Agregá productos con "+ Agregar", subí y bajá cantidades. → El total arriba y en "Tu pedido" se actualiza.
- [ ] **B2. Mínimo.** Con menos de $50.000. → Barra "Te faltan $X" y el botón "Iniciar compra" deshabilitado.
- [ ] **B3. Llegar al mínimo.** Pasá los $50.000. → "Llegaste al mínimo" y se habilita "Iniciar compra".
- [ ] **B4. Transferencia.** → Debajo del total se muestra "Con transferencia" con el 5% sumado.

## C. Checkout (sin cuentas)

- [ ] **C1. Campos obligatorios.** Tocá "Enviar pedido" sin datos. → Pide el nombre.
- [ ] **C2. Teléfono inválido.** Poné "555-1234". → Pide WhatsApp con código de área.
- [ ] **C3. Teléfonos válidos.** Probá "341 555-1234", "0341 15 555-1234", "+54 9 341 555 1234". → Los acepta (en el ERP quedan iguales: 543415551234).
- [ ] **C4. E-mail.** Dejalo vacío (es opcional) → OK. Poné uno mal escrito → lo rechaza.
- [ ] **C5. Envío sin dirección.** Elegí "Envío en Rosario" sin completar calle/número/ciudad/CP. → Pide la dirección.
- [ ] **C6. Retiro + efectivo.** Completá y enviá. → Pantalla del pedido con número, "Recibido", link para guardar y mensaje "¡Recibimos tu pedido #…!".
- [ ] **C7. Envío en Rosario + transferencia.** Con dirección completa. → Igual que C6; en el resumen dice "Envío: A coordinar".
- [ ] **C8. Envío por expreso.** → En el resumen: "$7.000 + flete".
- [ ] **C9. Nota.** Escribí una nota. → En la tienda demo (panel, en el pedido) y en el ERP aparece "Nota del cliente: …".
- [ ] **C10. Verificación anti-robots.** → Se ve el recuadro "For testing only" (modo prueba, aprueba solo). En producción usará claves reales.
- [ ] **C11. Botón "Mis pedidos".** Después de un pedido. → En el encabezado aparece "Mis pedidos" y lleva al último.

## D. Seguimiento (link privado)

- [ ] **D1. Copiar link.** En la pantalla del pedido, "Copiar". → Copia la dirección completa.
- [ ] **D2. Otro navegador.** Abrí ese link en otro navegador o en el celular. → Se ve el mismo pedido.
- [ ] **D3. Link alterado.** Cambiá una letra del final del link. → "No pudimos abrir este pedido".
- [ ] **D4. Sin datos personales.** → El seguimiento muestra productos, total, entrega y fecha, pero no el teléfono ni la dirección.
- [ ] **D5. Actualización sola.** Dejá abierto el seguimiento y avanzá el pedido desde el panel. → En ~15 segundos cambia solo.

## E. Pedido con retiro (panel + ERP + sitio)

Hacé un pedido con **retiro**, importalo y avanzalo con el panel. En cada paso mirá el seguimiento del cliente:

- [ ] **E1. Importar.** → Aparece en el panel y en el ERP (Pedidos → Cotización) con cliente, teléfono y productos.
- [ ] **E2. Cotización enviada.** → Cliente ve **"En revisión"**.
- [ ] **E3. Confirmar.** → Cliente ve **"Confirmado"**.
- [ ] **E4. Escanear todo (sin BOX).** → En el ERP queda escaneado; cliente ve **"En preparación"**.
- [ ] **E5. Pasar a BOX** (o "Escanear todo y pasar a BOX"). → ERP: listo en BOXn. Cliente: **"Listo para retirar"**.
- [ ] **E6. Cobrar (efectivo).** → Cliente ve **"Pagado"**.
- [ ] **E7. Entregar.** → Cliente ve **"Entregado"**. En el ERP pasa a Entregado.
- [ ] **E8. Atajo.** En otro pedido usá "Confirmar → escanear → BOX". → Queda listo en BOX en un paso.

## F. Pedido con envío (reparto)

- [ ] **F1. Hasta BOX.** Pedido con envío → "Confirmar → escanear → BOX". → ERP: listo para envío. Cliente: **"Listo"**.
- [ ] **F2. Salir sin cobrar.** → El panel muestra "Cobrar y salir a reparto" (el ERP no deja salir sin cobro).
- [ ] **F3. Salir a reparto.** → Repartidor ALAN, en reparto. Cliente: **"En camino"** y **"Pagado"**.
- [ ] **F4. Entregado al cliente.** → Cliente: **"Entregado"**.

## G. Cancelaciones

- [ ] **G1. Arrepentimiento antes de preparar.** Pedido nuevo (sin escanear). En el seguimiento: "Botón de arrepentimiento · Pedir cancelación". → "Tu pedido quedó cancelado". Importá en el panel → el ERP lo cancela solo ("Cancelaciones web revisadas: … 1 cancelado").
- [ ] **G2. Arrepentimiento ya preparado.** Pedido en BOX o en preparación → mismo botón. → "Recibimos tu pedido de cancelación" (no se cancela). Importá → en el ERP aparece la tarea urgente **"Pedido de cancelación web #…"** y el pedido marcado **"El cliente pidió cancelar · revisar"** (también en el panel).
- [ ] **G3. Arrepentimiento con el pedido cobrado (antes de preparar).** Confirmar y Cobrar sin escanear → botón. → Solo registra el pedido de cancelación (no cancela solo, porque hay plata que devolver).
- [ ] **G4. Cancelación interna antes de salir.** Desde el panel, "Cancelar" en un pedido confirmado. → Cancelado; cliente ve **"Cancelado"**. Si estaba cobrado: **"Devolución en curso"**.
- [ ] **G5. Cancelación interna en reparto.** Pedido en reparto → "Cancelar (en reparto)". → No se cancela todavía: el panel y el ERP lo marcan **"volver al local"**; el cliente ve **"Cancelación en curso"**.
- [ ] **G6. Intento de entrega bloqueado.** En ese pedido, intentá entregarlo (en el ERP). → Mensaje: "Este pedido se canceló: no lo entregues. Volvé al local…".
- [ ] **G7. Volvió al local.** Panel → "Volvió al local (cerrar cancelación)". → Cancelado; tarea de reponer stock; cliente ve **"Cancelado · Devolución en curso"**.
- [ ] **G8. Cancelación desde el panel de la tienda demo (en reparto).** *Requiere entrar al panel de la tienda demo en incógnito.* Cancelá ahí un pedido que esté en reparto e importá. → El ERP no lo cancela; crea la tarea **"Cancelación web en reparto"** y lo marca "volver al local".
- [ ] **G9. Sin doble cancelación.** Después de G8, cerrá con "Volvió al local". → En el ERP, Salud del sistema → Avisos a Tiendanube: la cancelación figura **"Omitido · ya estaba cancelado"** (no la vuelve a mandar).

## H. Pantallas del ERP

- [ ] **H1. Pendientes del equipo.** Inicio del ERP. → Se ven las tareas pendientes (cancelaciones, pedidos de cancelación, etc.).
- [ ] **H2. Marcas en la lista.** Pedidos → "En reparto". → Los cancelados en reparto dicen "Cancelado · no entregar: volver al local".
- [ ] **H3. Avisos a Tiendanube.** Administración → Salud del sistema. → Lista de avisos con "Enviado", "Omitido" o "No se pudo enviar" y el motivo.

## I. Páginas para Google

- [ ] **I1. Página de producto.** http://localhost:8787/productos/7794626013553/ → Foto, precio, unidades, precio por unidad y "Agregar al pedido".
- [ ] **I2. Agregar desde la página.** Tocá "Agregar al pedido". → Vuelve al sitio con el producto en el carrito y aviso "Agregado a tu pedido".
- [ ] **I3. Rubro.** http://localhost:8787/categoria/panales/ → Lista de pañales con enlaces a cada uno.
- [ ] **I4. Pie de la portada.** → Enlaces a los 8 rubros.
- [ ] **I5. Archivos.** http://localhost:8787/sitemap.xml y http://localhost:8787/robots.txt → El sitemap lista ~518 direcciones; robots dice "Disallow" (DEV).

## J. Casos raros

- [ ] **J1. Producto que no está en el catálogo del ERP.** Si "Escanear todo" da error de producto desconocido → panel "Sincronizar catálogo" y reintentá.
- [ ] **J2. Producto sin unidades** (ej. un set o combo). → Se muestra sin precio por unidad, sin errores.
- [ ] **J3. Mismo cliente, varios pedidos.** Dos pedidos con el mismo teléfono. → Ambos entran; en el ERP quedan con el mismo cliente.
- [ ] **J4. Muchos pedidos seguidos del mismo teléfono.** Más de 3 en una hora. → "Ya recibimos varios pedidos de este teléfono".
- [ ] **J5. Recargar en medio del checkout.** → Se pierde lo escrito pero no se crea ningún pedido.

## Lo que no se puede probar en local

- **Avisos de WhatsApp** a clientes (el ERP de prueba no tiene WhatsApp).
- **Límite por conexión** (5 pedidos cada 10 minutos): depende de Cloudflare publicado.
- **Anti-robots real** (en DEV aprueba siempre).
- **E-mails** de Tiendanube (los pedidos de prueba no los envían).
- **Detección inmediata** de cancelaciones: en local se detectan al tocar "Importar pedidos web".

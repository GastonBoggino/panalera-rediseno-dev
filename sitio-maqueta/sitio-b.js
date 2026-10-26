/* Sitio propio (plan B) — SOLO DEV.
   Conecta la maqueta con sitio-api: catálogo real, checkout propio sin cuentas que crea el
   pedido "a confirmar" en la tienda de prueba, seguimiento por link privado y cuentas
   opcionales con "Continuar con Google" (sin contraseñas; comprar sin cuenta sigue igual).
   Se carga después del script de la maqueta y reemplaza go, screen, renderCheckout,
   renderAccount y renderMyOrder; el resto de la maqueta queda igual. */
(() => {
  const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
  // Local: servidor aparte (8788). En línea: el mismo sitio sirve el servidor en /api.
  const API = LOCAL ? "http://localhost:8788" : (window.SITIO_API || "/api");
  // Clave pública de PRUEBA de Cloudflare Turnstile (siempre aprueba). Solo DEV.
  const TURNSTILE_SITEKEY = "1x00000000000000000000AA";
  // Solo DEV: la tienda demo no tiene fotos; se usan las de la maqueta por SKU (archivo sin costos).
  let IMG_POR_SKU = new Map();
  const fotosDev = !window.SITIO_PRODUCCION ? fetch("imagenes-dev.json").then(r => r.json()).then(m => { IMG_POR_SKU = new Map(Object.entries(m)); }).catch(() => {}) : Promise.resolve();
  const ENTREGAS = [
    { id: "retiro", name: "Retiro en Garay 1249", detail: "Lun a vie 8 a 16 h, sáb 9 a 13 h · sin cargo" },
    { id: "rosario", name: "Envío en Rosario y alrededores", detail: "El costo te lo confirmamos con el stock" },
    { id: "expreso", name: "Envío por expreso", detail: "$7.000 de traslado al expreso; el flete se paga al transporte" },
  ];
  // En celular, campos de 16 px o más: si no, iPhone hace zoom al tocarlos.
  document.head.insertAdjacentHTML("beforeend", "<style>@media (max-width: 767px){input,select,textarea{font-size:16px!important}}</style>");
  // Cuenta del cliente: la sesión viaja en una cookie segura que solo lee el servidor.
  const cuenta = { activa: false, clientId: "", cliente: null };
  const conSesion = (url, init = {}) => fetch(url, { ...init, credentials: "include" });
  const ck = { nombre: "", telefono: "", email: "", entrega: "retiro", calle: "", numero: "", piso: "", ciudad: "", provincia: "Santa Fe", cp: "", pago: "efectivo", nota: "", err: "", enviando: false, turnstile: "" };

  /* ---------- Catálogo real ---------- */
  function heroCats() {
    $("#heroCats").innerHTML = CATS.slice(0, 7).map((c, i) => {
      const n = P.filter(p => p.cat === c.id).length;
      const sub = i === 0 ? `${n} productos · talles RN a XXXG` : `${n} productos`;
      return `<button class="tile${i === 0 ? " main" : ""}" data-cat="${c.id}" style="background:var(${c.tint})"><i>${ICON[c.icon]}</i><span><b>${c.name}</b><small>${sub}</small></span><span class="go" aria-hidden="true">›</span></button>`;
    }).join("");
  }
  async function cargarCatalogo() {
    $("#count").textContent = "Cargando catálogo…";
    try {
      const [r] = await Promise.all([fetch(`${API}/catalogo`), fotosDev]);
      if (!r.ok) throw new Error(String(r.status));
      const { items } = await r.json();
      P.length = 0;
      // El carrito usa el id del producto: en el sitio propio es el de la variante en Tiendanube.
      // Segunda barrera: la maqueta pinta nombre, marca e imagen sin escapar.
      const limpio = v => String(v ?? "").replace(/[<>"'`]/g, "");
      const imagen = v => (/^https:\/\/[^\s"'<>]+$/.test(String(v || "")) ? String(v) : "");
      P.push(...items.map(it => ({ ...it, id: it.variant_id, brand: limpio(it.brand), name: limpio(it.name), talle: it.talle ? limpio(it.talle) : null, sku: limpio(it.sku), img: imagen(it.img) || imagen(IMG_POR_SKU.get(it.sku)) })));
      state.cart = {};
      heroCats(); render();
      // Llegó desde una página de producto ("Agregar al pedido"): se suma al carrito.
      const agregar = new URLSearchParams(location.search).get("agregar");
      if (agregar && P.some(p => String(p.id) === agregar)) {
        state.cart[agregar] = 1; renderGrid(); renderCart();
        toast("Agregado a tu pedido");
        history.replaceState(null, "", location.pathname + "#productos");
      }
    } catch (e) {
      $("#grid").innerHTML = `<div class="empty">No pudimos cargar el catálogo. <button class="btn btn-ghost" id="retryCat">Reintentar</button></div>`;
      $("#count").textContent = "";
    }
  }
  document.addEventListener("click", e => { if (e.target.closest("#retryCat")) cargarCatalogo(); });

  /* ---------- Navegación ---------- */
  go = function (view) {
    ["home", "checkout", "order", "account", "myorder"].forEach(v => $("#" + v).hidden = v !== view);
    document.querySelectorAll(".promo,.hdr,.nav,.foot").forEach(e => e.hidden = false);
    $("#cartbar").hidden = view !== "home";
    $("#kindBar").innerHTML = '<span class="kind own">Sitio propio · DEV · los pedidos se crean en la tienda de prueba</span>';
    $("#checkout").className = "sec";
    const phone = $("#frame").classList.contains("frame-phone");
    if (phone) $("#screen").scrollTop = 0; else if (view !== "home") $("#site").scrollIntoView({ block: "start" });
    if (view === "checkout") renderCheckout();
    if (view === "myorder") renderMyOrder();
    if (view === "account") renderAccount();
  };
  screen = function (s) {
    if (s === "checkout") {
      if (cartTotal() < MIN) return toast(`La compra mínima es de ${fmt(MIN)}`);
      return go("checkout");
    }
    if (s === "order" || s === "myorder") return go("myorder");
    if (s === "account") return cuenta.activa ? go("account") : toast("Seguís tu pedido con el link que te damos al enviarlo.");
    return go("home");
  };

  /* ---------- Checkout propio (sin cuentas) ---------- */
  const campo = (id, label, val, extra = "", attrs = "") =>
    `<label class="field ${extra}">${label}<input id="ck-${id}" value="${esc(val)}" maxlength="120" ${attrs}></label>`;

  function leerCheckout() {
    const g = id => ($("#ck-" + id)?.value ?? "").trim();
    if (!$("#ck-nombre")) return;
    Object.assign(ck, { nombre: g("nombre"), telefono: g("telefono"), email: g("email"), nota: g("nota") });
    if ($("#ck-calle")) Object.assign(ck, { calle: g("calle"), numero: g("numero"), piso: g("piso"), ciudad: g("ciudad"), provincia: g("provincia"), cp: g("cp") });
  }

  renderCheckout = function () {
    const items = cartItems(), tot = cartTotal(), envio = ck.entrega !== "retiro";
    const opt = (name, val, cur, title, small) =>
      `<label class="opt"><input type="radio" name="${name}" value="${val}" ${cur === val ? "checked" : ""}><span><b>${title}</b><small>${small}</small></span></label>`;
    $("#coView").innerHTML = `
      <button class="back" data-screen="home">← Seguir comprando</button>
      <h2 style="margin:0">Enviar pedido</h2>
      <p class="fine" style="text-align:left;margin-top:4px">Todavía no pagás: primero confirmamos el stock y el total por WhatsApp.</p>
      <div class="co-grid">
        <form class="co-steps" id="ck-form" novalidate>
          <fieldset class="co-box"><legend>Tus datos</legend><div class="fields">
            ${campo("nombre", "Nombre y apellido", ck.nombre, "full", 'autocomplete="name" required')}
            ${campo("telefono", "WhatsApp <small>con código de área</small>", ck.telefono, "", 'inputmode="tel" autocomplete="tel" placeholder="341 555-1234" required')}
            ${campo("email", "E-mail <small>(opcional)</small>", ck.email, "", 'type="email" autocomplete="email"')}
          </div></fieldset>
          <fieldset class="co-box"><legend>Entrega</legend><div class="opts">
            ${ENTREGAS.map(x => opt("ck-entrega", x.id, ck.entrega, x.name, x.detail)).join("")}
          </div>
          ${envio ? `<div class="fields">
            ${campo("calle", "Calle", ck.calle, "", 'autocomplete="address-line1"')}${campo("numero", "Número", ck.numero, "", 'inputmode="numeric"')}
            ${campo("piso", "Piso / depto <small>(opcional)</small>", ck.piso)}${campo("cp", "Código postal", ck.cp, "", 'inputmode="numeric" autocomplete="postal-code"')}
            ${campo("ciudad", "Ciudad", ck.ciudad, "", 'autocomplete="address-level2"')}${campo("provincia", "Provincia", ck.provincia, "", 'autocomplete="address-level1"')}
          </div>` : ""}
          </fieldset>
          <fieldset class="co-box"><legend>Pago</legend><div class="opts">
            ${opt("ck-pago", "efectivo", ck.pago, "Efectivo", envio ? "Al recibir (solo Rosario)" : "Al retirar")}
            ${opt("ck-pago", "transferencia", ck.pago, "Transferencia (+5%)", "Te pasamos los datos cuando confirmemos el total")}
          </div></fieldset>
          <fieldset class="co-box"><legend>Nota <small style="font-weight:400">(opcional)</small></legend>
            <label class="field"><textarea id="ck-nota" maxlength="500" rows="2" placeholder="Ej.: si falta algo, reemplazar por otra marca">${esc(ck.nota)}</textarea></label>
          </fieldset>
          <input id="ck-hp" name="empresa_web" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">
          <div id="ck-ts"></div>
          ${ck.err ? `<p class="tn-err" role="alert" style="color:#B42318;font-weight:600;margin:0">${esc(ck.err)}</p>` : ""}
          <button class="btn btn-sun big" type="submit" ${ck.enviando ? "disabled" : ""}>${ck.enviando ? "Enviando…" : "Enviar pedido"}</button>
        </form>
        <aside class="co-sum"><h3>Tu pedido</h3>
          ${items.map(i => `<div class="sumrow"><span>${i.q} × ${esc(i.p.brand + " " + i.p.name)}</span><span class="num">${fmt(i.p.price * i.q)}</span></div>`).join("")}
          <div class="sumrow total"><span>Total efectivo</span><b class="num">${fmt(tot)}</b></div>
          <div class="sumrow"><span>Con transferencia</span><span class="num">${fmt(Math.round(tot * 1.05))}</span></div>
          <div class="sumrow"><span>Envío</span><span>${ck.entrega === "retiro" ? "Sin cargo" : ck.entrega === "expreso" ? "$7.000 + flete" : "A coordinar"}</span></div>
        </aside>
      </div>`;
    turnstileWidget();
  };

  function turnstileWidget() {
    const box = $("#ck-ts");
    if (!box) return;
    if (!window.turnstile) return setTimeout(turnstileWidget, 300);
    turnstile.render(box, {
      sitekey: TURNSTILE_SITEKEY,
      callback: t => { ck.turnstile = t; },
      "expired-callback": () => { ck.turnstile = ""; },
    });
  }

  document.addEventListener("change", e => {
    if (e.target.name === "ck-entrega" || e.target.name === "ck-pago") {
      leerCheckout();
      ck[e.target.name.slice(3)] = e.target.value;
      renderCheckout();
    }
  });

  document.addEventListener("submit", async e => {
    if (e.target.id !== "ck-form") return;
    e.preventDefault();
    if (ck.enviando) return;
    leerCheckout();
    ck.err = "";
    if (ck.nombre.length < 2) ck.err = "Completá tu nombre.";
    else if (ck.telefono.replace(/\D/g, "").length < 10) ck.err = "Revisá el WhatsApp: con código de área, por ejemplo 341 555-1234.";
    else if (ck.entrega !== "retiro" && (!ck.calle || !ck.numero || !ck.ciudad || !ck.cp)) ck.err = "Completá la dirección de envío.";
    else if (!ck.turnstile) ck.err = "Esperá un segundo a que termine la verificación y volvé a tocar «Enviar pedido».";
    if (ck.err) return renderCheckout();

    ck.enviando = true; renderCheckout();
    const body = {
      turnstile: ck.turnstile,
      empresa_web: $("#ck-hp")?.value || "",
      items: Object.entries(state.cart).map(([id, q]) => ({ variant_id: Number(id), quantity: q })),
      cliente: { nombre: ck.nombre, telefono: ck.telefono, email: ck.email },
      entrega: ck.entrega === "retiro" ? { tipo: "retiro" } : { tipo: "envio", zona: ck.entrega, calle: ck.calle, numero: ck.numero, piso: ck.piso, ciudad: ck.ciudad, provincia: ck.provincia, cp: ck.cp },
      pago: ck.pago,
      nota: ck.nota,
    };
    try {
      // Con la sesión iniciada, el pedido queda en "Mis pedidos".
      const r = await conSesion(`${API}/pedido`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((data.errores || ["No pudimos enviar el pedido. Probá de nuevo o escribinos por WhatsApp."]).join(" "));
      const [, id, t] = data.seguimiento.match(/\/pedido\/(\d+)\?t=([0-9a-f]+)/);
      guardarPedido({ id, t, numero: data.numero, fecha: new Date().toISOString(), pago: ck.pago });
      state.cart = {}; render();
      Object.assign(ck, { enviando: false, turnstile: "", nota: "" });
      location.hash = `pedido=${id}.${t}`;
      go("myorder");
      toast(`¡Recibimos tu pedido #${data.numero}! Te escribimos por WhatsApp.`);
    } catch (err) {
      Object.assign(ck, { enviando: false, turnstile: "", err: err.message });
      renderCheckout();
    }
  });

  /* ---------- Seguimiento por link privado ---------- */
  function pedidosGuardados() { try { return JSON.parse(localStorage.getItem("pm-pedidos") || "[]"); } catch (_) { return []; } }
  function guardarPedido(p) {
    try { localStorage.setItem("pm-pedidos", JSON.stringify([p, ...pedidosGuardados().filter(x => x.id !== p.id)].slice(0, 20))); } catch (_) {}
    $("#myOrders").hidden = false;
  }
  function refActual() {
    const m = location.hash.match(/pedido=(\d+)\.([0-9a-f]{32})/);
    if (m) return { id: m[1], t: m[2] };
    const ult = pedidosGuardados()[0];
    return ult ? { id: ult.id, t: ult.t } : null;
  }

  const ETAPAS = { recibido: 0, en_revision: 1, confirmado: 2, preparando: 2, listo: 3, en_camino: 3, entregado: 5 };
  const TEXTO = {
    recibido: ["Recibimos tu pedido", "En breve lo revisamos y te escribimos por WhatsApp con el stock y el total final."],
    en_revision: ["Te enviamos el total", "Revisá el WhatsApp: confirmanos el pedido para que lo preparemos."],
    confirmado: ["Pedido confirmado", "En breve empezamos a prepararlo."],
    preparando: ["Estamos preparando tu pedido", "Te avisamos cuando esté listo."],
    listo: ["¡Listo!", "Ya podés retirarlo en Garay 1249 (lun a vie 8 a 16 h, sáb 9 a 13 h)."],
    en_camino: ["En camino", "Tu pedido salió. Te avisamos por WhatsApp."],
    entregado: ["Entregado", "¡Gracias por tu compra!"],
    cancelado: ["Pedido cancelado", "Si tenés dudas, escribinos por WhatsApp."],
  };

  renderMyOrder = async function (silencioso = false) {
    const v = $("#myOrderView"), ref = refActual();
    if (!ref) { v.innerHTML = `<div class="empty">Todavía no hiciste pedidos desde este dispositivo. Si tenés el link de tu pedido, abrilo para verlo.</div>`; return; }
    if (!silencioso) v.innerHTML = `<p class="fine">Cargando tu pedido…</p>`;
    let o;
    try {
      const r = await fetch(`${API}/pedido/${ref.id}?t=${ref.t}`);
      if (!r.ok) throw new Error();
      o = await r.json();
    } catch (_) { v.innerHTML = `<div class="empty">No pudimos abrir este pedido. Revisá el link o escribinos por WhatsApp.</div>`; return; }
    const retiro = /retiro/i.test(o.entrega), idx = ETAPAS[o.etapa] ?? 0;
    const pasos = ["Recibido", "En revisión", o.etapa === "preparando" ? "En preparación" : "Confirmado", retiro ? "Listo para retirar" : o.etapa === "listo" ? "Listo para el envío" : "En camino", "Entregado"];
    let [titulo, texto] = TEXTO[o.etapa] || TEXTO.recibido;
    // "Listo" con envío: no se retira, sale en el próximo reparto.
    if (o.etapa === "listo" && !retiro) [titulo, texto] = ["¡Listo para el envío!", "Tu pedido está preparado y sale en el próximo reparto. Te avisamos por WhatsApp cuando esté en camino."];
    if (o.cancelacionSolicitada) [titulo, texto] = ["Recibimos tu pedido de cancelación", "Te escribimos por WhatsApp para resolverlo. Hasta entonces el pedido sigue su curso."];
    if (o.cancelacionEnCurso) [titulo, texto] = ["Cancelación en curso", "El pedido vuelve al local. Te escribimos por WhatsApp para coordinar la devolución."];
    // En camino o entregado ya no se puede cancelar desde la web.
    const puedePedirCancelar = !["cancelado", "entregado", "en_camino"].includes(o.etapa) && !o.cancelacionSolicitada && !o.cancelacionEnCurso;
    if (o.etapa === "cancelado" && o.pago === "reintegro") texto = "Ya habías pagado: te vamos a escribir por WhatsApp para coordinar la devolución del dinero.";
    if (o.etapa === "cancelado" && o.canceladoEnCamino) texto += " El pedido ya había salido: el repartidor lo va a traer de vuelta al local.";
    const guardado = pedidosGuardados().find(x => x.id === ref.id);
    const link = `${location.origin}${location.pathname}#pedido=${ref.id}.${ref.t}`;
    v.innerHTML = `<button class="back" data-screen="home">← Volver a la tienda</button>
      <div class="ord-head"><h2>Pedido #${esc(o.numero)}</h2>${o.etapa === "cancelado" ? '<span class="pill bad">Cancelado</span>' : ""}${o.pago === "reintegro" ? '<span class="pill wait">Devolución en curso</span>' : o.etapa === "cancelado" ? "" : o.pago === "pagado" ? '<span class="pill ok">Pagado</span>' : '<span class="pill wait">Pago pendiente</span>'}</div>
      ${o.etapa === "cancelado" ? "" : `<ol class="track" aria-label="Estado del pedido">${pasos.map((s, i) => `<li class="${i < idx ? "done" : i === idx ? "now" : ""}">${s}</li>`).join("")}</ol>`}
      <div class="co-grid">
        <div class="co-steps">
          <div class="stat ${idx >= 2 ? "ok" : ""}"><h3>${titulo}</h3><p>${texto}</p></div>
          ${o.pago !== "pagado" && o.etapa !== "cancelado" ? `<div class="card"><h3>Pago</h3><p style="margin:0">${guardado?.pago === "transferencia" ? "Transferencia: te pasamos los datos cuando confirmemos el total (se suma un 5%). Después nos mandás el comprobante por WhatsApp." : `Efectivo ${retiro ? "al retirar" : "al recibir"}.`}</p></div>` : ""}
          ${puedePedirCancelar ? `<div class="card"><h3>¿Querés cancelar?</h3><p style="margin:0 0 10px">${idx >= 2 ? "Tu pedido ya se está preparando: te vamos a contactar para resolverlo." : "Mientras no empecemos a prepararlo, se cancela al instante."}</p>
            <button class="btn btn-ghost" data-cancel-order>Botón de arrepentimiento · Pedir cancelación</button></div>` : ""}
          ${cuenta.activa && !cuenta.cliente ? `<div class="card"><h3>Guardá tus pedidos en tu cuenta</h3><p style="margin:0 0 10px">Entrá con Google y vas a ver todos tus pedidos desde cualquier dispositivo. Sin contraseñas.</p><div data-google-btn></div></div>` : ""}
          <div class="card"><h3>Guardá este link</h3><p style="margin:0 0 8px">Con este link volvés a ver tu pedido desde cualquier dispositivo. No lo compartas.</p>
            <div class="bank"><div><span class="num" style="word-break:break-all">${esc(link)}</span><button class="copy" data-copy="${esc(link)}">Copiar</button></div></div>
            <button class="btn btn-ghost" style="margin-top:10px" data-refresh-order>Actualizar estado</button></div>
        </div>
        <aside class="co-sum"><h3>Tu pedido</h3>
          ${o.items.map(i => `<div class="sumrow"><span>${esc(i.cantidad)} × ${esc(i.nombre)}</span><span class="num">${fmt(i.precio * i.cantidad)}</span></div>`).join("")}
          <div class="sumrow total"><span>Total</span><b class="num">${fmt(o.total)}</b></div>
          <div class="sumrow"><span>Entrega</span><span>${esc(o.entrega)}</span></div>
          <div class="sumrow"><span>Fecha</span><span>${esc(new Date(o.fecha).toLocaleString("es-AR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }))}</span></div>
        </aside>
      </div>`;
    if (!silencioso) botonesGoogle();
  };
  document.addEventListener("click", e => { if (e.target.closest("[data-refresh-order]")) renderMyOrder(); });
  // Botón de arrepentimiento (Res. 424/2020): cancela si todavía no se preparó; si no, registra el pedido.
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-cancel-order]");
    if (!b) return;
    const ref = refActual();
    if (!ref || !confirm("¿Querés pedir la cancelación de este pedido?")) return;
    const motivo = prompt("Si querés, contanos el motivo (opcional):") || "";
    b.disabled = true;
    try {
      const r = await fetch(`${API}/pedido/${ref.id}/cancelacion?t=${ref.t}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d.errores || ["No pudimos registrar el pedido. Escribinos por WhatsApp."]).join(" "));
      toast(d.resultado === "solicitado" ? "Recibimos tu pedido de cancelación. Te escribimos por WhatsApp." : "Tu pedido quedó cancelado.");
      renderMyOrder();
    } catch (err) { toast(err.message); b.disabled = false; }
  });
  // Mientras se ve el seguimiento, se actualiza solo (sin parpadeo) cada 15 segundos.
  setInterval(() => { if (!$("#myorder").hidden && !document.hidden) renderMyOrder(true); }, 15000);

  /* ---------- Cuenta: Continuar con Google y Mis pedidos ---------- */
  const ETIQUETA = { recibido: "Recibido", en_revision: "En revisión", confirmado: "Confirmado", preparando: "En preparación", listo: "Listo", en_camino: "En camino", entregado: "Entregado", cancelado: "Cancelado" };
  const fechaCorta = f => new Date(f).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });

  function pintarBotonCuenta() {
    $("#acctBtn").hidden = !cuenta.activa;
    $("#acctLbl").textContent = cuenta.cliente ? (cuenta.cliente.nombre.split(" ")[0] || "Mi cuenta") : "Ingresar";
    $("#myOrders").hidden = !cuenta.cliente && pedidosGuardados().length === 0;
  }

  // El script de Google se carga recién cuando hace falta mostrar el botón.
  let google$ = null;
  function cargarGoogle() {
    if (!google$) google$ = new Promise((ok, mal) => {
      const sc = document.createElement("script");
      sc.src = "https://accounts.google.com/gsi/client"; sc.async = true;
      sc.onload = () => {
        google.accounts.id.initialize({ client_id: cuenta.clientId, callback: alEntrarConGoogle, ux_mode: "popup", auto_select: false, context: "signin" });
        ok();
      };
      sc.onerror = () => { google$ = null; mal(new Error("google")); };
      document.head.appendChild(sc);
    });
    return google$;
  }
  async function botonesGoogle() {
    const cajas = [...document.querySelectorAll("[data-google-btn]")];
    if (!cajas.length || !cuenta.activa || cuenta.cliente) return;
    try { await cargarGoogle(); } catch (_) { cajas.forEach(c => c.innerHTML = '<p class="fine">No pudimos cargar el botón de Google. Recargá la página.</p>'); return; }
    cajas.forEach(c => { c.innerHTML = ""; google.accounts.id.renderButton(c, { theme: "outline", size: "large", text: "continue_with", shape: "pill", locale: "es-419", width: 280 }); });
  }

  // Pedidos guardados en este dispositivo (con su link firmado) que se suman a la cuenta.
  const pedidosParaSumar = () => pedidosGuardados().map(p => ({ id: p.id, t: p.t, numero: p.numero }));

  async function alEntrarConGoogle(resp) {
    try {
      const r = await conSesion(`${API}/sesion/google`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: resp.credential, pedidos: pedidosParaSumar() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d.errores || ["No pudimos entrar. Probá de nuevo."]).join(" "));
      cuenta.cliente = d.cliente;
      pintarBotonCuenta();
      const hola = `¡Hola${d.cliente.nombre ? ", " + d.cliente.nombre.split(" ")[0] : ""}!`;
      toast(d.sumados > 0 ? `${hola} Sumamos ${d.sumados} pedido${d.sumados === 1 ? "" : "s"} a tu cuenta.` : `${hola} Tus pedidos quedan guardados en tu cuenta.`);
      if (!$("#myorder").hidden) renderMyOrder(); else go("account");
    } catch (err) { toast(err.message); }
  }

  renderAccount = async function () {
    const v = $("#accountView");
    if (!cuenta.cliente) {
      v.innerHTML = `<button class="back" data-screen="home">← Volver a la tienda</button>
        <div class="card" style="max-width:520px;margin:0 auto"><h2 style="margin:0 0 6px">Entrá a tu cuenta</h2>
          <p style="margin:0 0 14px">Guardá tus pedidos y miralos desde cualquier dispositivo. <b>Sin contraseñas.</b></p>
          <div data-google-btn></div>
          <p class="fine" style="text-align:left;margin-top:14px">No hace falta cuenta para comprar: también podés seguir tu pedido con el link que te damos al enviarlo.</p></div>`;
      return botonesGoogle();
    }
    const c = cuenta.cliente;
    v.innerHTML = `<button class="back" data-screen="home">← Volver a la tienda</button>
      <div class="ord-head"><h2>Hola${c.nombre ? ", " + esc(c.nombre.split(" ")[0]) : ""}</h2></div>
      <p class="fine" style="text-align:left;margin-top:0">${esc(c.email)}</p>
      <h3>Mis pedidos</h3><div id="misPedidos"><p class="fine" style="text-align:left">Cargando tus pedidos…</p></div>
      <div class="acts" style="margin-top:18px;display:flex;flex-wrap:wrap;gap:8px"><button class="btn btn-sun" data-screen="home">Ir a la tienda</button>
        <button class="btn btn-ghost" data-salir>Cerrar sesión</button><button class="btn btn-ghost" data-salir-todo>Cerrar sesión en todos los dispositivos</button></div>`;
    try {
      const r = await conSesion(`${API}/mis-pedidos`);
      if (r.status === 401) { cuenta.cliente = null; pintarBotonCuenta(); return renderAccount(); }
      const { pedidos } = await r.json();
      $("#misPedidos").innerHTML = pedidos.length ? pedidos.map(p => `<a class="card" style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;text-decoration:none;color:inherit;margin-bottom:10px" href="#pedido=${esc(p.id)}.${esc(p.t)}">
          <span><b>Pedido #${esc(p.numero)}</b><br><small class="fine">${esc(fechaCorta(p.fecha))} · ${esc(p.entrega)}</small></span>
          <span style="text-align:right"><span class="pill ${p.etapa === "cancelado" ? "bad" : p.etapa === "entregado" ? "ok" : "wait"}">${esc(ETIQUETA[p.etapa] || p.etapa)}</span><br><b class="num">${fmt(p.total)}</b></span></a>`).join("")
        : `<div class="empty">Todavía no tenés pedidos en tu cuenta. Los que hagas con la sesión iniciada aparecen acá.</div>`;
    } catch (_) { $("#misPedidos").innerHTML = `<div class="empty">No pudimos cargar tus pedidos. Probá de nuevo.</div>`; }
  };

  document.addEventListener("click", async e => {
    const todo = e.target.closest("[data-salir-todo]"), uno = e.target.closest("[data-salir]");
    if (!todo && !uno) return;
    if (todo && !confirm("¿Cerrar la sesión en todos tus dispositivos?")) return;
    await conSesion(`${API}/sesion/${todo ? "cerrar-todas" : "cerrar"}`, { method: "POST" }).catch(() => {});
    try { google.accounts.id.disableAutoSelect(); } catch (_) {}
    cuenta.cliente = null; pintarBotonCuenta(); go("home");
    toast("Cerraste la sesión.");
  });

  async function iniciarCuenta() {
    try {
      const r = await conSesion(`${API}/sesion`);
      const d = await r.json();
      Object.assign(cuenta, { activa: !!(d.cuentas && d.googleClientId), clientId: d.googleClientId || "", cliente: d.cliente || null });
    } catch (_) { cuenta.activa = false; }
    pintarBotonCuenta();
    // Con sesión: los pedidos hechos en este dispositivo antes de entrar se suman solos.
    if (cuenta.cliente && pedidosGuardados().length) conSesion(`${API}/mis-pedidos/vincular`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pedidos: pedidosParaSumar() }) }).catch(() => {});
    if (!$("#account").hidden) renderAccount();
    if (!$("#myorder").hidden) botonesGoogle();
  }

  /* ---------- Arranque ---------- */
  // Siempre a pantalla completa: sin el modo "celular" de la maqueta.
  $("#frame").className = "frame-desk";
  try { localStorage.removeItem("pm-view"); } catch (_) {}
  $("#acctBtn").hidden = true;
  $("#myOrders").hidden = pedidosGuardados().length === 0;
  // "Mis pedidos" con sesión lleva a la cuenta (todos los pedidos); sin sesión, al último de este dispositivo.
  $("#myOrders").addEventListener("click", e => { if (cuenta.cliente) { e.stopImmediatePropagation(); go("account"); } }, true);
  document.querySelectorAll('#jump [data-screen="account"], #jump [data-screen="order"]').forEach(b => b.hidden = true);
  go("home");
  cargarCatalogo();
  iniciarCuenta();
  if (/pedido=/.test(location.hash)) go("myorder");
  // Abrir un link de pedido con el sitio ya abierto solo cambia el "#": hay que mostrarlo igual.
  window.addEventListener("hashchange", () => { if (/pedido=/.test(location.hash)) go("myorder"); });
})();

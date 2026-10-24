// node arrepentimiento.mjs <idTiendanube> <token>  → aprieta el botón de arrepentimiento (igual que el sitio)
const [id, t] = process.argv.slice(2);
const r = await fetch(`http://127.0.0.1:8788/pedido/${id}/cancelacion?t=${t}`, { method: 'POST', headers: { Origin: 'http://localhost:8787', 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo: 'Prueba de casos' }) });
console.log(r.status, JSON.stringify(await r.json()));

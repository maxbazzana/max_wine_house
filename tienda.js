// Lógica del catálogo y del carrito, compartida por las tres versiones del sitio (ES, EN, PT).
// Necesita que products.js se cargue antes.
// Los textos en español están acá abajo (TEXTOS_ES). Las versiones /en/ y /pt/ definen window.MWH
// en su propio index.html con las traducciones, la ruta base ('../') y el formato de moneda.
// El pedido que llega por WhatsApp se arma SIEMPRE en español, con una línea que indica el idioma del cliente.

const TEXTOS_ES = {
    variety: 'Variedad / Uva:',
    boxOnly: 'Solo Caja Cerrada',
    addBottle: '+1 Botella',
    addBox: 'AGREGAR CAJA',
    offer: 'OFERTA',
    soldOut: 'AGOTADO',
    soon: 'PRÓXIMAMENTE',
    exclusive: 'Exclusivo x Caja',
    logoAlt: b => `Logo de la bodega ${b}`,
    each: 'c/u',
    boxOf: n => `Caja x${n}:`,
    retail: 'Precio Minorista:',
    toastBox: 'Caja agregada',
    toastBottle: 'Botella agregada',
    emptyCart: 'Tu caja está vacía.',
    chosen: 'Elegida:',
    missingOne: '⚠️ Falta <strong>1</strong> botella individual para completar la caja mixta de 6.',
    missingMany: n => `⚠️ Faltan <strong>${n}</strong> botellas individuales para completar la caja mixta de 6.`,
    validOrder: '✅ ¡Pedido válido! Todo listo.',
    aliasCopied: 'Alias copiado',
    alertFill: 'Completá tus datos y la forma de pago.',
    ageDeniedTitle: 'Acceso no permitido',
    ageDeniedText: 'Lo sentimos: la venta de bebidas alcohólicas está prohibida a menores de 18 años. Volvé cuando seas mayor de edad.',
    dateLabel: null // null = se muestra la fecha en español, igual que en el mensaje
};

const M = Object.assign({ lang: 'es', langName: 'Español', base: '', locale: 'es-AR', cur: '$' }, window.MWH || {});
const T = Object.assign({}, TEXTOS_ES, M.t || {});
const money = n => M.cur + n.toLocaleString(M.locale);

let cart = [];
let displayedProducts = [];
let showingOffers = false;

// ===== Entregas: miércoles y viernes, 9 a 18 h =====
// Si un día de entrega cae feriado, esa fecha se anula (no se corre a otro día).
// El pedido debe hacerse como mínimo el día anterior hasta las 15:00 (hora de Buenos Aires).
const DIAS_ENTREGA = [3, 5];          // 3 = miércoles, 5 = viernes
const HORA_CORTE = 15;                // 15:00 del día anterior
const CANTIDAD_FECHAS = 6;            // fechas que se muestran en el selector

// Feriados con año (formato AAAA-MM-DD)
const FERIADOS = [
    // 2026
    "2026-01-01", "2026-02-16", "2026-02-17", "2026-03-23", "2026-03-24", "2026-04-02", "2026-04-03",
    "2026-05-01", "2026-05-25", "2026-06-15", "2026-06-20", "2026-07-09", "2026-07-10", "2026-08-17",
    "2026-10-12", "2026-11-23", "2026-12-07", "2026-12-08", "2026-12-25",
    // 2027 (fijos y trasladables por ley; los puentes todavía no fueron anunciados: agregarlos cuando salgan)
    "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-24", "2027-03-26", "2027-04-02", "2027-05-01",
    "2027-05-25", "2027-06-20", "2027-06-21", "2027-07-09", "2027-08-16", "2027-10-11", "2027-11-20",
    "2027-12-08", "2027-12-25"
];

// Fechas de entrega excepcionales (fuera de miércoles y viernes)
const ENTREGAS_EXTRA = [
    "2027-03-23"  // Martes de Semana Santa: el miércoles 24 y el viernes 26 son feriados
];

// Fecha y hora actuales en Buenos Aires, sin importar la zona horaria del celular del cliente
function ahoraEnBuenosAires(base) {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(base || new Date());
    const v = t => parseInt(partes.find(p => p.type === t).value, 10);
    return { y: v('year'), m: v('month'), d: v('day'), h: v('hour') };
}

const claveFecha = f => `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`;

// Devuelve las próximas fechas de entrega válidas (como fechas UTC de calendario)
function proximasEntregas(base) {
    const ahora = ahoraEnBuenosAires(base);
    const hoy = new Date(Date.UTC(ahora.y, ahora.m - 1, ahora.d));
    const fechas = [];
    const f = new Date(hoy);
    f.setUTCDate(f.getUTCDate() + 1);   // nunca para el mismo día
    for (let i = 0; i < 120 && fechas.length < CANTIDAD_FECHAS; i++) {
        const clave = claveFecha(f);
        const esDiaEntrega = DIAS_ENTREGA.includes(f.getUTCDay()) || ENTREGAS_EXTRA.includes(clave);
        if (esDiaEntrega && !FERIADOS.includes(clave)) {
            // Corte: el día anterior a las 15:00
            const vispera = new Date(f); vispera.setUTCDate(vispera.getUTCDate() - 1);
            const llegaATiempo = hoy < vispera || (hoy.getTime() === vispera.getTime() && ahora.h < HORA_CORTE);
            if (llegaATiempo) fechas.push(new Date(f));
        }
        f.setUTCDate(f.getUTCDate() + 1);
    }
    return fechas;
}

function initDeliveryDates() {
    const select = document.getElementById('deliveryDate');
    select.innerHTML = '';
    const days = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    proximasEntregas().forEach(f => {
        const opt = document.createElement('option');
        const label = `${days[f.getUTCDay()]} ${f.getUTCDate()} ${months[f.getUTCMonth()]} (9 a 18hs)`;
        // Fecha local al mediodía, para que las traducciones muestren el mismo día del calendario
        const fechaLocal = new Date(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate(), 12);
        opt.value = label; // el valor queda en español: es lo que llega en el mensaje de WhatsApp
        opt.innerText = T.dateLabel ? T.dateLabel(fechaLocal) : label;
        select.appendChild(opt);
    });
}

function extractVariants(name) {
    let cleanName = name.replace(/\(OFERTA\)/gi, "").replace(/\(AGOTADO\)/gi, "").replace(/\(PRÓXIMAMENTE\)/gi, "").trim();
    const parenthesisMatch = cleanName.match(/\(([^)]+)\)/);
    if (parenthesisMatch && parenthesisMatch[1].includes('/')) return parenthesisMatch[1].split('/').map(v => v.trim());
    if (cleanName.includes('/')) return cleanName.split('/').map(v => v.trim().replace(/^\(/, '').replace(/\)$/, ''));
    return null;
}

function filterOffers() {
    showingOffers = !showingOffers;
    const btn = document.getElementById('btn-ofertas');
    if (showingOffers) {
        btn.style.boxShadow = '0 0 0 2px white';
    } else {
        btn.style.boxShadow = 'none';
    }
    document.getElementById('offers-bar').style.display = showingOffers ? 'flex' : 'none';
    renderProducts();
    if (showingOffers) window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Vuelve a la pagina principal: quita ofertas y filtros y sube al inicio
function goHome() {
    showingOffers = false;
    document.getElementById('btn-ofertas').style.boxShadow = 'none';
    document.getElementById('offers-bar').style.display = 'none';
    document.getElementById('searchInput').value = '';
    document.getElementById('bodegaFilter').value = 'all';
    renderProducts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderProducts() {
    const grid = document.getElementById('product-grid');
    grid.innerHTML = '';
    const search = document.getElementById('searchInput').value.toLowerCase();
    const bodega = document.getElementById('bodegaFilter').value;
    displayedProducts = products.filter(p => {
        const matchesSearch = p.nombre.toLowerCase().includes(search) || p.bodega.toLowerCase().includes(search);
        const matchesBodega = bodega === 'all' || p.bodega === bodega;
        const matchesOffer = showingOffers ? p.nombre.toUpperCase().includes("OFERTA") : true;
        return matchesSearch && matchesBodega && matchesOffer;
    });
    displayedProducts.forEach((p, index) => {
        const unitsInBox = p.uCaja || 6;
        const variants = extractVariants(p.nombre);
        const isOffer = p.nombre.toUpperCase().includes("OFERTA");
        const isAgotado = p.nombre.toUpperCase().includes("AGOTADO");
        const isProximamente = p.nombre.toUpperCase().includes("PRÓXIMAMENTE");
        const isExclusivo = p.soloCaja;

        let displayName = p.nombre.replace(/\(OFERTA\)/gi, "").replace(/\(AGOTADO\)/gi, "").replace(/\(PRÓXIMAMENTE\)/gi, "").trim();
        if(variants) displayName = displayName.split('(')[0].trim();

        let imgName = p.bodega;
        if (imgName === "ALMA NEGRA (Ernesto Catena)") imgName = "ALMA NEGRA";
        if (imgName === "EL ENEMIGO (Bodega Aleanna)") imgName = "EL ENEMIGO";
        if (imgName === "ERNESTO CATENA") imgName = "Esnesto_Catena";
        if (imgName === "RICCITELLI") imgName = "riccitelli";
        if (imgName === "KRONTIRAS") imgName = "Krontiras";
        if (imgName === "ALFA CRUX") imgName = "alfa_crux";
        if (imgName === "ANTUCURA") imgName = "antucura";
        if (imgName === "EL ESTECO") imgName = "el_esteco";
        if (imgName === "KARIM MUSSI") imgName = "karim_mussi";
        if (imgName === "MIL SUELOS") imgName = "mil_suelos";
        if (imgName === "SOLOCONTIGO") imgName = "solo_contigo";
        if (imgName === "YANAY") imgName = "yanay";
        if (imgName === "RAQUIS") imgName = "raquis";
        if (imgName === "COLOMÉ") imgName = "COLOMÉ";
        if (imgName === "DURIGUTTI") imgName = "DURIGUTTI";
        if (imgName === "TUTU WINES") imgName = "tutu_wines";
        if (imgName === "ALTOS LAS HORMIGAS") imgName = "altos_las_hormigas";
        if (imgName === "ZUCCARDI") imgName = "zuccardi";
        if (imgName === "ALTALAND") imgName = "altaland";
        if (imgName === "NINA") imgName = "nina";
        if (imgName === "FALASCO") imgName = "falasco";
        if (imgName === "ALTAR UCO") imgName = "altar_uco";
        if (imgName === "KAIKEN") imgName = "kaiken";
        if (imgName === "ZORZAL") imgName = "zorzal";
        if (imgName === "TRUMPETER (Rutini Wines)") imgName = "TRUMPETER";
        if (imgName === "EL BAYEH") imgName = "el_bayeh";
        if (imgName === "MICHELINI I MUFATTO") imgName = "michelini_mufatto.jpg";
        if (imgName === "MUNDO REVÉS") imgName = "mundo_reves";
        if (imgName === "4 GATOS LOCOS") imgName = "4_gatos_locos";
        if (imgName === "CASARENA") imgName = "Casarena";
        if (imgName === "COINCIDIR") imgName = "Coincidir";
        if (imgName === "OTRONIA") imgName = "Otronia";
        if (imgName === "FLECHAS DE LOS ANDES") imgName = "Flecha_de_los_Andes.jpg";
        // Logos optimizados en WebP (los PNG/JPG originales quedan en la carpeta, sin usarse)
        const imagePath = `${M.base}logos bodegas/${imgName.replace(/\.(png|jpe?g)$/i, '')}.webp`;

        let variantHTML = variants ? `
            <div class="variant-selector">
                <label>${T.variety}</label>
                <select id="variant-select-${index}" class="variant-select">
                    ${variants.map(v => `<option value="${v}">${v}</option>`).join('')}
                </select>
            </div>` : '';

        const btnBotella = p.soloCaja
            ? `<button class="btn btn-bottle" disabled style="opacity: 0.6; cursor: not-allowed; border-color: #eee;">${T.boxOnly}</button>`
            : `<button class="btn btn-bottle" onclick="addToCart(${index}, 1)">${T.addBottle}</button>`;

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            ${isOffer ? '<div class="offer-badge">🔥 ' + T.offer + '</div>' : ''}
            ${isAgotado ? '<div class="offer-badge" style="background-color: #555; right: 10px;">🚫 ' + T.soldOut + '</div>' : ''}
            ${isProximamente ? '<div class="offer-badge" style="background-color: #555; right: 10px;">⏳ ' + T.soon + '</div>' : ''}
            ${isExclusivo ? '<div class="offer-badge" style="left: 10px; right: auto; background-color: #2c3e50;">' + T.exclusive + '</div>' : ''}
            <div class="card-image-container">
                <img src="${imagePath}" alt="${T.logoAlt(p.bodega)}" loading="${index < 6 ? 'eager' : 'lazy'}" decoding="async" onerror="this.style.display='none'">
            </div>
            <div class="card-header">${p.bodega}</div>
            <div class="card-body">
                <div class="card-title">${displayName}</div>
                <div class="card-price">${money(p.precio)} <small>${T.each}</small></div>
                <span class="box-price">${T.boxOf(unitsInBox)} ${money(p.caja)}</span>
                ${p.precioMinorista ? `<span class="box-price" style="color: #666; font-weight: 500;">${T.retail} ${money(p.precioMinorista)} ${T.each}</span>` : ''}
                ${variantHTML}
            </div>
            <div class="actions">
                ${(isAgotado || isProximamente) ? `<button class="btn btn-bottle" disabled style="opacity: 0.6; cursor: not-allowed; border-color: #eee;">${T.addBottle}</button>` : btnBotella}
                ${(isAgotado || isProximamente) ? `<button class="btn btn-box" disabled style="background-color: #888; color: #fff; cursor: not-allowed; box-shadow: none;">${T.addBox}</button>` : `<button class="btn btn-box" onclick="addToCartBox(${index}, ${unitsInBox})">${T.addBox}</button>`}
            </div>`;
        grid.appendChild(card);
    });
}

function addToCartBox(idx, qty) {
    const p = displayedProducts[idx];
    if (p.nombre.toUpperCase().includes("AGOTADO") || p.nombre.toUpperCase().includes("PRÓXIMAMENTE")) return;
    let name = p.nombre.replace(/\(OFERTA\)/gi, "").replace(/\(AGOTADO\)/gi, "").replace(/\(PRÓXIMAMENTE\)/gi, "").trim();
    if (name.includes('(')) name = name.split('(')[0].trim();
    const vSel = document.getElementById(`variant-select-${idx}`);
    let fullName = name;
    if (vSel) fullName += ` (Elegida: ${vSel.value})`;
    const unitPrice = p.caja / qty;
    const exist = cart.find(i => i.bodega === p.bodega && i.nombre === fullName && i.precio === unitPrice && i.isBox === true);
    if (exist) exist.qty += qty; else cart.push({ bodega: p.bodega, nombre: fullName, precio: unitPrice, qty: qty, isBox: true, boxSize: qty });
    updateCartUI(); showToast(T.toastBox);
}

function addToCart(idx, qty) {
    const p = displayedProducts[idx];
    if (p.nombre.toUpperCase().includes("AGOTADO") || p.nombre.toUpperCase().includes("PRÓXIMAMENTE")) return;
    let name = p.nombre.replace(/\(OFERTA\)/gi, "").replace(/\(AGOTADO\)/gi, "").replace(/\(PRÓXIMAMENTE\)/gi, "").trim();
    if (name.includes('(')) name = name.split('(')[0].trim();
    const vSel = document.getElementById(`variant-select-${idx}`);
    let fullName = name;
    if (vSel) fullName += ` (Elegida: ${vSel.value})`;

    // Uso del precio minorista por unidad si existe
    const unitPrice = p.precioMinorista ? p.precioMinorista : p.precio;

    const exist = cart.find(i => i.bodega === p.bodega && i.nombre === fullName && i.precio === unitPrice && i.isBox === false);
    if (exist) exist.qty += qty; else cart.push({ bodega: p.bodega, nombre: fullName, precio: unitPrice, qty: qty, isBox: false });
    updateCartUI(); showToast(T.toastBottle);
}

function removeFromCart(index) { cart.splice(index, 1); updateCartUI(); }

function togglePaymentInfo() {
    const method = document.getElementById('paymentMethod').value;
    document.getElementById('transfer-info').style.display = method.startsWith('Transferencia') ? 'block' : 'none';
    document.getElementById('pix-info').style.display = method === 'Pix' ? 'block' : 'none';
    document.getElementById('usd-info').style.display = method.includes('USD') ? 'block' : 'none';
}

function updateCartUI() {
    const count = cart.reduce((acc, i) => acc + i.qty, 0);
    document.getElementById('cart-count').textContent = count;
    const itemsDiv = document.getElementById('cart-items');
    const valMsg = document.getElementById('cart-validation-msg');
    const btn = document.getElementById('btn-checkout');
    itemsDiv.innerHTML = ''; let total = 0;

    // Conteo diferenciado para la lógica de validación
    let countBottles = cart.filter(i => !i.isBox).reduce((acc, i) => acc + i.qty, 0);
    let hasBoxes = cart.some(i => i.isBox);

    if (cart.length === 0) {
        valMsg.className = 'cart-alert'; valMsg.innerHTML = T.emptyCart;
        valMsg.style.display = 'block'; btn.disabled = true;
    } else {
        cart.forEach((item, i) => {
            const sub = item.precio * item.qty; total += sub;
            const dName = item.nombre.replace(" (Elegida:", '<br><span class="selected-variant-text">👉 ' + T.chosen).replace(")", "</span>");
            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div style="flex-grow:1">
                    <div style="font-weight:bold; color:var(--primary); font-size:0.9em;">${item.bodega}</div>
                    <div>${dName}</div>
                    <small style="color:#777">${item.qty} x ${money(item.precio)}</small>
                </div>
                <div style="text-align:right">
                    <div style="font-weight:bold;">${money(Math.round(sub))}</div>
                    <button style="background:none; border:none; color:#e74c3c; cursor:pointer;" onclick="removeFromCart(${i})">🗑️</button>
                </div>`;
            itemsDiv.appendChild(div);
        });

        // Lógica de pedido mínimo (ignora cajas cerradas, exige múltiplos de 6 para mixtas)
        if (countBottles > 0 && countBottles % 6 !== 0) {
            const missing = 6 - (countBottles % 6);
            valMsg.className = 'cart-alert'; 
            if (missing === 1) {
                valMsg.innerHTML = T.missingOne;
            } else {
                valMsg.innerHTML = T.missingMany(missing);
            }
            btn.disabled = true;
        } else {
            valMsg.className = 'cart-success'; 
            valMsg.innerHTML = T.validOrder;
            btn.disabled = false;
        }
    }
    document.getElementById('cart-total-price').textContent = Math.round(total).toLocaleString(M.locale);
}

function copyAlias() {
    navigator.clipboard.writeText("bazzana.max-1906").then(() => showToast(T.aliasCopied));
}

function openCart() { document.getElementById('cartModal').style.display = 'block'; }
function closeCart() { document.getElementById('cartModal').style.display = 'none'; }
function openRulesModal() { document.getElementById('rulesModal').style.display = 'block'; }
function closeRulesModal() { document.getElementById('rulesModal').style.display = 'none'; }

function showToast(msg) {
    const t = document.getElementById('toast'); t.textContent = msg; t.style.opacity = 1;
    setTimeout(() => t.style.opacity = 0, 3000);
}

function sendOrder() {
    const name = document.getElementById('customerName').value;
    const addr = document.getElementById('customerAddress').value;
    const date = document.getElementById('deliveryDate').value;
    const payment = document.getElementById('paymentMethod').value;
    const obs = document.getElementById('customerObs').value;

    if (!name || !addr || !payment) { alert(T.alertFill); return; }

    let msg = `*SALES ORDER Nº*\n👤 Cliente: ${name}\n📍 Dirección: ${addr}\n📅 Entrega: ${date}\n💵 Pago: ${payment}\n🌐 Idioma del cliente: ${M.langName}\n`;

    if (obs && obs.trim() !== "") {
        msg += `📝 Observaciones: ${obs}\n`;
    }

    msg += `-------------------\n Detalle del pedido:\n`;

    let total = 0;
    let totalBotellas = 0;
    let totalCajas = 0;
    let cajasCerradasCount = 0;
    let botellasMixtasCount = 0;

    const cajasMixtas = cart.filter(i => !i.isBox);
    const cajasCerradas = cart.filter(i => i.isBox);

    const getFinalName = (i) => {
        let finalName = "";
        if (i.nombre.includes("(Elegida:")) {
            const parts = i.nombre.split("(Elegida:");
            const base = parts[0].trim();
            const variant = parts[1].replace(")", "").trim();
            // Incluye el nombre del vino además de la variedad elegida
            finalName = base && !base.includes('/') ? `${i.bodega} ${base} – ${variant}` : `${i.bodega} ${variant}`;
        } else {
            const cleanName = i.nombre.replace('<br>', ' ').replace('<span class="selected-variant-text">', '').replace('</span>', '');
            finalName = `${i.bodega} ${cleanName}`;
        }
        return finalName;
    };

    if (cajasMixtas.length > 0) {
        msg += `*Caja Mixta*\n`;
        let botellasMixtas = 0;
        cajasMixtas.forEach(i => {
            const subtotal = i.precio * i.qty;
            total += subtotal;
            totalBotellas += i.qty;
            botellasMixtas += i.qty;
            msg += `▪️ (${i.qty}u) ${getFinalName(i)}\n`;
            msg += `   ↳ ${i.qty} x $${i.precio.toLocaleString('es-AR')} = $${subtotal.toLocaleString('es-AR')}\n`;
        });
        totalCajas += (botellasMixtas / 6);
        botellasMixtasCount = botellasMixtas;
    }

    if (cajasCerradas.length > 0) {
        if (cajasMixtas.length > 0) msg += `\n`; 
        msg += `*Caja Cerrada*\n`;
        cajasCerradas.forEach(i => {
            const subtotal = i.precio * i.qty;
            total += subtotal;
            totalBotellas += i.qty;
            const bSize = i.boxSize || 6;
            totalCajas += (i.qty / bSize);
            cajasCerradasCount += Math.round(i.qty / bSize);
            msg += `▪️ (${i.qty}u) ${getFinalName(i)}\n`;
            msg += `   ↳ ${i.qty} x $${i.precio.toLocaleString('es-AR')} = $${subtotal.toLocaleString('es-AR')}\n`;
        });
    }


    msg += `-------------------\nTotal de botellas: ${totalBotellas}\n`;
    // Detalle de cajas: cerradas por un lado y mixtas (o botellas sueltas) por otro
    if (cajasCerradasCount > 0) {
        msg += `Cajas cerradas: ${cajasCerradasCount}\n`;
    }
    if (botellasMixtasCount > 0) {
        const mixtasCompletas = Math.floor(botellasMixtasCount / 6);
        const sueltas = botellasMixtasCount % 6;
        if (mixtasCompletas > 0) msg += `Cajas mixtas: ${mixtasCompletas} (${mixtasCompletas * 6} botellas)\n`;
        if (sueltas > 0) msg += `Botellas sueltas: ${sueltas}\n`;
    }
    msg += `💰 *TOTAL: $${Math.round(total).toLocaleString('es-AR')}*\n`;
    msg += `-------------------\n👤 Vendedor: Max Bazzana`;

    window.open(`https://wa.me/5491130529102?text=${encodeURIComponent(msg)}`, '_blank');
}

function init() {
    const bodegas = [...new Set(products.map(p => p.bodega))].sort();
    const sel = document.getElementById('bodegaFilter');
    bodegas.forEach(b => { const o = document.createElement('option'); o.value = b; o.textContent = b; sel.appendChild(o); });
    renderProducts(); initDeliveryDates();
}

window.onclick = e => { 
    if (e.target == document.getElementById('cartModal')) closeCart(); 
    if (e.target == document.getElementById('rulesModal')) closeRulesModal();
}
init();

// Verificacion de edad: se pregunta una vez y se recuerda en el navegador
(function () {
    const gate = document.getElementById('age-gate');
    const KEY = 'mwh-mayor-18';
    let ok = false;
    try { ok = localStorage.getItem(KEY) === 'ok'; } catch (e) {}
    if (ok) return;
    gate.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('age-yes').focus();
    document.getElementById('age-yes').addEventListener('click', function () {
        try { localStorage.setItem(KEY, 'ok'); } catch (e) {}
        gate.hidden = true;
        document.body.style.overflow = '';
    });
    document.getElementById('age-no').addEventListener('click', function () {
        document.getElementById('age-title').textContent = T.ageDeniedTitle;
        const t = document.getElementById('age-text');
        t.className = 'age-denied';
        t.textContent = T.ageDeniedText;
        document.getElementById('age-actions').style.display = 'none';
    });
})();

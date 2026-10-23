# Aplica el piloto del rediseño al tema Ipanema bajado (sin fork: solo JSON).
import json, pathlib
here = pathlib.Path(__file__).parent
tema = here.parent / 'tema-ipanema-dev'
# Siempre parte de la Ipanema original (primer commit del git local).
import subprocess
subprocess.run(["git", "checkout", "-q", "aee55f3", "--", "templates", "config"], cwd=tema, check=True)

def load(p): return json.loads((tema / p).read_text())
def save(p, d): (tema / p).write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

s = load('config/settings_data.json')
s['settings'].update({
    'background_color': '#F7F8FB', 'text_color': '#1B2340', 'accent_color': '#168A5E',
    'header_background_color': '#FFFFFF', 'header_foreground_color': '#1B2340',
    'footer_background_color': '#1B2340', 'footer_foreground_color': '#FFFFFF',
    'button_primary_background_color': '#FFC21A', 'button_primary_foreground_color': '#1B2340',
    'button_primary_border_radius': 14, 'button_secondary_border_radius': 14,
    'button_secondary_foreground_color': '#1B2340', 'button_tertiary_foreground_color': '#1B2340',
    'label_background_color': '#168A5E', 'featured_link_color': '#168A5E', 'stock_foreground_color': '#168A5E',
    'font_headings': '"Outfit", sans-serif', 'font_rest': '"Figtree", sans-serif',
    'cart_minimum_value': 50000,
})
save('config/settings_data.json', s)

def add_code(page, key, file, after):
    t = load(page)
    t['sections'][key] = {
        'type': 'custom', 'settings': {'section_width': 'page', 'direction': 'column'},
        'blocks': {key + '_code': {'type': 'code', 'settings': {'code': (here / file).read_text(), 'width': 'fill'}}},
        'block_order': [key + '_code'],
    }
    order = [k for k in t['order'] if k != key]
    order.insert(order.index(after) + 1, key)
    t['order'] = order
    save(page, t)

prod = load('templates/pages/product.json')
items = prod['sections']['main_product']['blocks']['product_info']['blocks']['purchase_info']['blocks']
items['icon_returns']['settings'].update({'icon': 'store', 'title': 'Retiro en Garay 1249', 'description': 'Generalmente en el día, cuando te avisamos que está listo.'})
items['icon_security']['settings'].update({'icon': 'cash', 'title': 'Pagás después de confirmar', 'description': 'Efectivo, o transferencia +5% con comprobante por WhatsApp.'})
save('templates/pages/product.json', prod)
add_code('templates/pages/product.json', 'piloto_ficha', 'ficha.html', 'main_product')
add_code('templates/pages/cart.json', 'piloto_carrito', 'carrito.html', 'cart_form')

# Inicio: portada propia, productos (sección nativa) y "cómo comprar" / FAQ / visita.
home = load('templates/pages/home.json')
fp = home['sections']['featured_products_1']
fp['settings']['vertical_padding'] = 32
fp['blocks']['header_group']['blocks']['heading']['settings']['title'] = 'Pañales'
fp['blocks']['header_group']['blocks']['view_all_button']['settings']['label'] = 'Ver todos los productos'
fp['blocks']['products']['settings'].update({'products_source': {'kind': 'category', 'id': 41703654}, 'format': 'grid', 'columns': '4', 'columns_mobile': '2', 'max_products': 8})
save('templates/pages/home.json', home)
add_code('templates/pages/home.json', 'piloto_inicio', 'inicio-hero.html', 'slideshow')
add_code('templates/pages/home.json', 'piloto_como', 'inicio-como.html', 'featured_products_1')
home = load('templates/pages/home.json')
home['order'] = ['piloto_inicio', 'featured_products_1', 'piloto_como']
for k in [k for k in home['sections'] if k not in home['order']]:
    del home['sections'][k]
save('templates/pages/home.json', home)

# Barra superior con las condiciones de compra y logo a la izquierda.
hdr = load('templates/layout/header.json')
nav = hdr['sections']['navigation_bar']
nav['settings']['background_color'] = '#1B2340'
group = nav['blocks']['nav_icon_text']
group['blocks'] = {
    'item_1': {'type': 'nav-icon-text-item', 'settings': {'icon_source': 'design', 'icon': 'bag', 'description': 'Compra mínima <b>$50.000</b> combinando marcas'}},
    'item_2': {'type': 'nav-icon-text-item', 'settings': {'icon_source': 'design', 'icon': 'cash', 'description': 'Precios en efectivo · Transferencia +5%'}},
    'item_3': {'type': 'nav-icon-text-item', 'settings': {'icon_source': 'design', 'icon': 'store', 'description': 'Retiro en Garay 1249 o envío'}},
}
group['block_order'] = ['item_1', 'item_2', 'item_3']
h = hdr['sections']['header']
h['settings'].update({'logo_position_desktop': 'left', 'text_color': '#1B2340'})
h['blocks']['navigation']['settings']['nav_uppercase'] = False
nav['settings'].update({'background_color': '#FFC21A', 'text_color': '#1B2340'})
h['blocks']['utilities']['settings'].update({'format': 'icons_text', 'search_type': 'expanded', 'search_type_mobile': 'expanded'})
h['settings']['logo_position_mobile'] = 'left'
h['settings']['use_different_mobile_position'] = False
# Capa global (estilos y scripts del rediseño) dentro del grupo del encabezado.
hdr['sections']['piloto_global'] = {
    'type': 'custom', 'settings': {'section_width': 'page', 'direction': 'column', 'vertical_padding': 0},
    'blocks': {'piloto_global_code': {'type': 'code', 'settings': {'code': (here / 'global.html').read_text(), 'width': 'fill'}}},
    'block_order': ['piloto_global_code'],
}
hdr['order'] = [k for k in hdr['order'] if k != 'piloto_global'] + ['piloto_global']
save('templates/layout/header.json', hdr)

# Pie: datos del local en lugar de los textos de ejemplo.
ftr = load('templates/layout/footer.json')
f = ftr['sections']['footer']
f['settings'].update({'background_color': '#1B2340', 'text_color': '#FFFFFF', 'vertical_padding': 48})
f['blocks'] = {
    'institutional': {'type': 'footer-institutional', 'settings': {
        'description': 'Pañalera Mayorista · Garay 1249, Rosario. Lun a vie 8–16 h, sábados 9–13 h. Compra mínima $50.000 · Transferencia +5%.',
        'logo_height': 40, 'show_contact': True, 'show_social': True}},
    'menu_1': {'type': 'footer-menu', 'settings': {'title': 'Navegación', 'menu': 'navigation'}},
}
f['block_order'] = ['institutional', 'menu_1']
save('templates/layout/footer.json', ftr)

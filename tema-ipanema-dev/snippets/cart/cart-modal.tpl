{# Cart modal - Ajax cart panel #}

{% if not store.is_catalog and settings.ajax_cart and template != 'cart' %}

	{% embed 'snippets/modals/modal.tpl' with {
		modal_id: 'modal-cart',
		data_component: 'cart',
		custom_data_attribute: 'cart-open-type',
		custom_data_attribute_value: settings.cart_open_type,
		form: true,
		form_action: store.cart_url,
		form_data_store: 'cart-form',
		position: {
			dock_desktop: true,
			appear_from: 'right',
		},
		layout: {
			width_desktop: 'small',
		},
		title: 'cart.title' | t,
		modal_classes: {
			close_icon: 'icon-inline',
		}
	} %}
		{% block modal_body %}
			{% include 'snippets/cart/cart-panel.tpl' %}
		{% endblock %}
	{% endembed %}
{% endif %}

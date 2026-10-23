{# Cart drawer section - Ajax cart panel, refetched by the async cart #}

{% include 'snippets/cart/cart-modal.tpl' %}

{% schema %}
{
  "name": "t:names.cart_drawer",
  "class": "section-cart-drawer",
  "static": true,
  "limit": 1,
  "settings": [],
  "enabled_on": {
    "layout_templates": ["cart_drawer"]
  }
}
{% endschema %}

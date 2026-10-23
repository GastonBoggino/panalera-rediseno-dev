{#
  Pagination
  Page navigation: load-more button or prev/next links.
#}
{% set next_href = page_next ? page_next.url : null %}
{% set prev_href = page_prev ? page_prev.url : null %}
{# Page-part cursor first (variants as products), classic pagination as fallback #}
{% set prev_link = prev_href ?: pages.previous %}
{% set next_link = next_href ?: pages.next %}
{% if infinite_scroll %}
	{% if pages.current == 1 and (not pages.is_last or page_next) %}
		<div class="js-load-more pagination-load-more">
			<a class="btn btn-primary">
				{{ 'general.show_more_products' | t }}
				<span class="js-load-more-spinner pagination-load-more-spinner" style="display:none;">
					<svg class="icon-loading icon-inline"><use xlink:href="#spinner-third"/></svg>
				</span>
			</a>
		</div>
		<div id="js-infinite-scroll-spinner" class="pagination-spinner" style="display:none">
			<svg class="icon-loading icon-inline"><use xlink:href="#spinner-third"/></svg>
		</div>
	{% endif %}
{% else %}
	{% if pages.numbers or next_href or prev_href %}
		<div class="pagination-nav">
			<a {% if prev_link %}href="{{ prev_link }}"{% endif %} class="pagination-arrow pagination-arrow-prev {% if not prev_link %}opacity-30 disabled{% endif %}">
				<svg class="slider-arrow slider-arrow-prev icon-inline"><use xlink:href="#arrow-long"/></svg>
			</a>
			{% if pages.numbers and not (product_listing and store.has_variants_as_products) %}
				<div class="pagination-counter">
					{% for page in pages.numbers %}
						{% if page.selected %}
							<span>{{ page.number }}</span>
						{% endif %}
					{% endfor %}
					<span>/</span>
					<span>{{ pages.amount }}</span>
				</div>
			{% endif %}
			<a {% if next_link %}href="{{ next_link }}"{% endif %} class="pagination-arrow {% if not next_link %}opacity-30 disabled{% endif %}">
				<svg class="slider-arrow icon-inline"><use xlink:href="#arrow-long"/></svg>
			</a>
		</div>
	{% endif %}
{% endif %}

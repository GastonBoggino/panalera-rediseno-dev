#!/bin/zsh
# Carga (o cambia) la contraseña del DEV en línea. La escribe el usuario; no queda guardada en ningún archivo.
cd "${0:A:h}" && exec ../erp-prueba/node_modules/.bin/wrangler secret put ACCESO_DEV --config wrangler.online.jsonc

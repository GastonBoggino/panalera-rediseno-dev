#!/bin/zsh
# Ejecuta el CLI de Tiendanube con Node 24, desde esta carpeta.
export PATH="$HOME/.local/node24/bin:$PATH"
cd "${0:A:h}" && exec tiendanube "$@"

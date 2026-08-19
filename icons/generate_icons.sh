#!/bin/bash

# Script pour générer les icônes PNG à partir du SVG
# Nécessite ImageMagick (installer avec: sudo apt install imagemagick)

SVG_FILE="/home/luke/Projets/linksshare/firefox-nextcloud-bookmarks/icons/icon.svg"

# Tailles nécessaires
sizes=(16 32 48 96)

for size in "${sizes[@]}"; do
    echo "Génération de l'icône $size x $size..."
    convert -background none -resize "${size}x${size}" "$SVG_FILE" "/home/luke/Projets/linksshare/firefox-nextcloud-bookmarks/icons/icon-${size}.png"
done

echo "Toutes les icônes ont été générées !"

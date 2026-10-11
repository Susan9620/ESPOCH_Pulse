# Trazabilidad de transformaciones — ESPOCH Pulse

## 2026-10-03 — Normalización visual de parqueaderos

- **Fecha de la transformación:** 2026-10-03 (America/Guayaquil).
- **Archivo fuente:** `data/base/parqueaderos.geojson`.
- **Archivo generado:** `data/processed/parqueaderos.geojson`.
- **Regla aplicada:** excluir únicamente de la versión procesada los tres elementos `Point` indicados en los criterios de limpieza, contenidos en polígonos de estacionamiento.
- **Identificadores excluidos:** `node/6975145503`, `node/7654086001` y `node/7654086029`.
- **Motivo:** normalización exclusivamente visual para evitar una posible doble representación de los mismos espacios de estacionamiento; no implica que los datos originales de OpenStreetMap sean incorrectos.
- **Resultado:** 24 elementos: 22 `Polygon` y 2 `Point`, frente a los 27 elementos originales: 22 `Polygon` y 5 `Point`.
- **Validación:** GeoJSON `FeatureCollection` válido en UTF-8, con coordenadas WGS84 / EPSG:4326 en orden longitud–latitud. Ninguno de los tres identificadores excluidos aparece en la versión procesada; todos los demás permanecen, con sus geometrías y atributos intactos.
- **Conservación de la fuente:** los datos originales permanecen intactos en `data/base/`. Se verificó que `data/base/parqueaderos.geojson` conserva exactamente sus bytes originales y su huella SHA-256. No se procesó ninguna otra capa.

## 2026-10-03 — Normalización visual de servicios

- **Fecha:** 2026-10-03 (America/Guayaquil).
- **Archivo fuente:** `data/base/servicios.geojson`.
- **Archivo generado:** `data/processed/servicios.geojson`.
- **Regla aplicada:** excluir únicamente de la versión procesada los siete elementos `Point` indicados, contenidos en áreas con el mismo valor de `amenity`.
- **Identificadores excluidos:** `node/6975134272`, `node/6975134273`, `node/6975134274`, `node/6975145493`, `node/6975145498`, `node/6975145529` y `node/6975145536`.
- **Motivo:** normalización exclusivamente visual para evitar una posible doble visualización del mismo servicio; no implica que el dato original de OpenStreetMap sea incorrecto.
- **Resultado final:** 27 elementos: 22 `Polygon` y 5 `Point`, frente a los 34 elementos originales: 22 `Polygon` y 12 `Point`.
- **Validación:** GeoJSON `FeatureCollection` válido en UTF-8, con coordenadas WGS84 / EPSG:4326 en orden longitud–latitud. Los siete IDs excluidos están ausentes; todos los demás IDs originales permanecen, con sus geometrías y atributos exactamente iguales. No se corrigió «FCP-AUDITORIO» (`way/502925051`), que conserva `amenity=library`.
- **Conservación de la fuente:** `data/base/servicios.geojson` permanece intacto, verificado mediante comparación de bytes y SHA-256. Se conserva íntegra la entrada anterior de parqueaderos. No se procesó ninguna otra capa.

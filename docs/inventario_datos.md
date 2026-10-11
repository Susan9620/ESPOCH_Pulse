# Inventario de datos GIS — ESPOCH Pulse

**`data/base/` contiene datos fuente que deben mantenerse sin modificaciones, mientras que las futuras correcciones, transformaciones o adaptaciones para ESPOCH Pulse deberán guardarse en `data/processed/`.**

Este inventario documenta los seis archivos existentes. Los conteos, atributos y solapamientos se comprobaron mediante lectura local; las exclusiones durante la obtención se registran a partir del historial del proyecto. No se descargaron datos ni se realizaron correcciones.

Los seis archivos son `FeatureCollection` GeoJSON válidas en UTF-8, con geometrías válidas. Utilizan coordenadas geográficas WGS84 / EPSG:4326, en orden longitud–latitud, conforme a la convención GeoJSON; no declaran un miembro `crs`. La fuente es OpenStreetMap, con atribución a sus colaboradores y licencia ODbL-1.0. Los atributos enumerados existen en al menos un elemento de cada capa, pero no necesariamente en todos.

| Archivo | Elementos | Geometrías | Con nombre |
| --- | ---: | --- | ---: |
| `data/base/campus.geojson` | 1 | 1 Polygon | 1 |
| `data/base/edificios.geojson` | 187 | 187 Polygon | 169 |
| `data/base/vias.geojson` | 122 | 122 LineString | 26 |
| `data/base/areas_verdes.geojson` | 4 | 4 Polygon | 3 |
| `data/base/parqueaderos.geojson` | 27 | 5 Point y 22 Polygon | 4 |
| `data/base/servicios.geojson` | 34 | 12 Point y 22 Polygon | 20 |

Los conteos corresponden a objetos OSM conservados, no necesariamente a instalaciones únicas. Un mismo objeto puede aparecer en varias capas temáticas.

## 1. campus.geojson

- **Propósito:** límite espacial de referencia del campus matriz de la ESPOCH en Riobamba.
- **Elementos y geometría:** 1 Polygon.
- **Sistema de coordenadas:** WGS84 / EPSG:4326, longitud–latitud.
- **Fuente:** API de OpenStreetMap, objeto `way/268181656`. El atributo original `source=senescyt` indica la procedencia declarada en OSM; la descarga procede de OpenStreetMap.
- **Atributos disponibles:** `name`, `short_name`, `amenity`, `addr:full`, `ec:campus`, `ec:sede_tipo`, `source`, `osm_id`, `osm_type`, `osm_url`, `data_source`, `attribution`, `license`.
- **Observaciones:** identificado como `ec:campus=RIOBAMBA` y `ec:sede_tipo=MATRIZ`. El nombre está correctamente codificado como «Escuela Superior Politécnica de Chimborazo». Es el límite cartografiado en OSM, no una certificación de deslinde catastral. No se detectaron problemas geométricos.

## 2. edificios.geojson

- **Propósito:** huellas de edificios y construcciones etiquetadas con `building=*`, completamente dentro del campus.
- **Elementos y geometría:** 187 Polygon; 169 con nombre y 18 sin nombre.
- **Sistema de coordenadas:** WGS84 / EPSG:4326, longitud–latitud.
- **Fuente:** OpenStreetMap mediante Overpass API. Marca temporal de los datos: `2026-10-04T00:05:06Z` (UTC).
- **Atributos disponibles:** `name`, `building`, `building:levels`, `amenity`, `wheelchair`, `osm_id`, `osm_type`.
- **Observaciones:** «Zona maniobras - Conduesposh» (`way/819653546`) y «Area» (`way/819653547`) tienen `building=yes` y `amenity=driving_school`; su clasificación como edificios requiere revisión. Se conservaron sin correcciones. Dos objetos distintos se llaman «FCP-AUDITORIO»: `way/502198070` tiene `amenity=community_centre` y `way/502925051` tiene `amenity=library`; ambos tienen `building=apartments`, combinación que merece revisión. El nombre compartido no basta para afirmar que son duplicados. Durante la obtención se excluyeron cuatro garajes/parqueaderos y dos edificios exteriores que solo tocaban el límite.

## 3. vias.geojson

- **Propósito:** movilidad interna mediante vías y senderos de OSM totalmente contenidos en el campus, sin recortar sus trazados.
- **Elementos y geometría:** 122 LineString; 26 con nombre.
- **Sistema de coordenadas:** WGS84 / EPSG:4326, longitud–latitud.
- **Fuente:** OpenStreetMap mediante Overpass API, consulta `highway=*`. Marca temporal: `2026-10-04T00:20:35Z` (UTC).
- **Atributos disponibles:** `name`, `highway`, `surface`, `foot`, `bicycle`, `motor_vehicle`, `access`, `oneway`, `osm_id`, `osm_type`.
- **Distribución:** `service`: 48; `footway`: 40; `residential`: 26; `path`: 8.
- **Observaciones:** se excluyeron diez geometrías que cruzaban el límite para conservar los trazados originales sin incorporar segmentos exteriores. Eran los objetos `way/108714182`, `way/109035523`, `way/128298698`, `way/247587969`, `way/330168550`, `way/330168551`, `way/332290954`, `way/747188340`, `way/1461755108` y `way/1461755109`. Entre ellos estaban «Puerta 2 Espoch», «Puerta Posterior Espoch» y dos trazados de «Longitudinal 1». Esta exclusión puede dejar incompleta la conectividad de accesos en la capa; no se corrigió ni se recortó ningún trazado.

## 4. areas_verdes.geojson

- **Propósito:** superficies razonablemente identificadas como áreas verdes en OSM y completamente dentro del campus.
- **Elementos y geometría:** 4 Polygon; 3 con nombre.
- **Sistema de coordenadas:** WGS84 / EPSG:4326, longitud–latitud.
- **Fuente:** OpenStreetMap mediante Overpass API. Marca temporal: `2026-10-04T00:27:35Z` (UTC).
- **Atributos disponibles:** `name`, `leisure`, `osm_id`, `osm_type`.
- **Observaciones:** las cuatro áreas tienen `leisure=park`. La consulta no encontró resultados para `landuse=grass`, `natural=grassland`, `leisure=garden`, `natural=wood` ni `landuse=forest`. La cobertura cartográfica es limitada: esta capa no constituye un inventario completo de la vegetación real del campus. Se excluyeron «Canchas Multiples - Fie» (`way/747151171`), pese a su etiqueta de parque, y «Cabaña_parque_estudiante» (`way/747154371`), cuyo nombre y pequeña huella sugieren una construcción; esta última interpretación sigue pendiente de verificación. No se completaron áreas manualmente.

## 5. parqueaderos.geojson

- **Propósito:** espacios de estacionamiento identificados como `amenity=parking`, dentro del campus, excluyendo edificios de garajes.
- **Elementos y geometría:** 27 elementos: 5 Point y 22 Polygon; 4 con nombre y 2 con `capacity` registrada.
- **Sistema de coordenadas:** WGS84 / EPSG:4326, longitud–latitud.
- **Fuente:** OpenStreetMap mediante Overpass API. Marca temporal: `2026-10-04T00:34:35Z` (UTC).
- **Atributos disponibles:** `name`, `amenity`, `parking`, `access`, `capacity`, `surface`, `fee`, `osm_id`, `osm_type`.
- **Observaciones:** tres puntos están contenidos en polígonos de estacionamiento y podrían representar los mismos espacios. Se conservaron ambos tipos de objeto, por lo que no debe interpretarse el total como 27 parqueaderos distintos. Se excluyeron `way/502926583` y `way/747151948`, etiquetados como edificios de garajes de varias plantas.

| Punto | Polígono que lo contiene |
| --- | --- |
| `node/6975145503` | `way/745130190` |
| `node/7654086001` | `way/819653545` |
| `node/7654086029` | `way/819653552` |

## 6. servicios.geojson

- **Propósito:** servicios y puntos de interés del campus pertenecientes exclusivamente a las categorías de `amenity` seleccionadas para esta etapa.
- **Elementos y geometría:** 34 elementos: 12 Point y 22 Polygon; 20 con nombre.
- **Sistema de coordenadas:** WGS84 / EPSG:4326, longitud–latitud.
- **Fuente:** OpenStreetMap mediante Overpass API. Marca temporal: `2026-10-04T00:40:49Z` (UTC).
- **Atributos disponibles:** `name`, `amenity`, `access`, `wheelchair`, `opening_hours`, `fee`, `osm_id`, `osm_type`.
- **Distribución:** `toilets`: 14; `restaurant`: 6; `cafe`: 5; `library`: 5; `bicycle_parking`: 3; `fast_food`: 1. Sin resultados interiores para `drinking_water`, `clinic`, `pharmacy`, `atm`, `bank`, `waste_basket` y `waste_disposal`; esto no demuestra que esos servicios no existan físicamente.
- **Observaciones:** siete puntos están contenidos en seis áreas con el mismo `amenity`, por lo que podrían duplicar servicios. Los objetos se conservaron sin fusionarlos. «FCP-AUDITORIO» (`way/502925051`) está etiquetado como `amenity=library`; la discrepancia entre nombre y clasificación queda pendiente de revisión. Las áreas que también aparecen en edificios representan otra dimensión temática del mismo objeto OSM, no necesariamente un error.

| Punto | Área que lo contiene | amenity compartido |
| --- | --- | --- |
| `node/6975134272` | `way/745130185` | `toilets` |
| `node/6975134273` | `way/745130184` | `restaurant` |
| `node/6975134274` | `way/745130192` | `toilets` |
| `node/6975145493` | `way/745130188` | `toilets` |
| `node/6975145498` | `way/745130189` | `bicycle_parking` |
| `node/6975145529` | `way/745130193` | `toilets` |
| `node/6975145536` | `way/745130193` | `toilets` |

Las observaciones identifican revisiones futuras; no constituyen correcciones ni autorizan cambios sobre `data/base/`.

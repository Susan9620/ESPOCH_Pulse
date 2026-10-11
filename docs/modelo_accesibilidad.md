# Modelo de accesibilidad simulada — ESPOCH Pulse

## Propósito

La futura capa de accesibilidad permitirá representar elementos relevantes para analizar y proponer rutas accesibles dentro del campus.

La capa será `data/simulated/accesibilidad.geojson`. En esta prueba de concepto todos sus datos serán simulados y no constituirán un inventario oficial de accesibilidad de la ESPOCH.

Este documento define únicamente el modelo y un ejemplo conceptual. No genera elementos como archivos de datos ni crea rutas.

## Tipo de geometría

La capa será una `FeatureCollection` GeoJSON y utilizará únicamente geometría `Point` en WGS84 / EPSG:4326, con coordenadas en orden longitud–latitud. Cada punto representará un elemento o condición localizada relacionada con accesibilidad, dentro del campus.

## Atributos

Cada `Feature` tendrá exactamente los siguientes siete atributos en `properties`:

| Atributo | Tipo | Formato o valores permitidos | Descripción |
| --- | --- | --- | --- |
| `id` | string | `ACC-001`, `ACC-002`, etc. | Identificador único del elemento simulado. |
| `tipo` | string | `rampa`, `escalera`, `acceso`, `obstaculo`, `cruce` | Tipo de elemento o condición localizada. |
| `estado` | string | `adecuado`, `requiere_atencion`, `no_accesible` | Estado del elemento en el escenario simulado. |
| `descripcion` | string | Texto breve. | Descripción del elemento o condición simulada. |
| `zona` | string | Texto. | Edificio o sector de referencia. |
| `apto_movilidad_reducida` | boolean | `true` o `false`, según las reglas del modelo. | Indica si, para la demostración, el punto puede formar parte de una ruta destinada a personas con movilidad reducida. |
| `es_simulado` | boolean | Siempre `true`. | Identifica explícitamente el carácter ficticio del registro. |

## Reglas

- Las coordenadas se almacenarán únicamente en la geometría GeoJSON; no se repetirán como atributos `lat` y `lon`.
- Todos los elementos serán simulados.
- No se afirmará que una rampa, escalera, obstáculo, cruce o acceso exista físicamente en esa ubicación.
- Los puntos se colocarán en lugares plausibles utilizando como referencia edificios y vías reales de `data/base/edificios.geojson` y `data/base/vias.geojson`, sin modificar esas capas. Sus coordenadas deberán estar dentro de `data/base/campus.geojson`.
- La mayor parte de la demostración se concentrará en la FIE.
- Todo elemento de tipo `escalera` deberá utilizar `apto_movilidad_reducida=false`.
- Una futura ruta accesible no deberá utilizar puntos de tipo `escalera`, `obstaculo` ni ningún elemento con `apto_movilidad_reducida=false`.
- Todo elemento de tipo `obstaculo` deberá utilizar `apto_movilidad_reducida=false`.
- Todo elemento con estado `no_accesible` deberá tener `apto_movilidad_reducida=false`.
- Los elementos `rampa`, `acceso` o `cruce` podrán ser aptos o no según el escenario simulado, respetando la regla del estado `no_accesible`.
- La futura ruta accesible deberá evitar elementos no aptos y podrá apoyarse en puntos adecuados. En esta etapa no se generan rutas.
- Todos los registros utilizarán `es_simulado=true`.
- No se utilizarán nombres de personas ni datos personales. El atributo `zona` identificará un edificio o sector de referencia.
- Los identificadores serán únicos. Los atributos booleanos se almacenarán como `true` o `false`, no como cadenas de texto.
- La aptitud indicada corresponde exclusivamente a la demostración; no certifica la accesibilidad física de un lugar ni de una ruta real.

## Ejemplo conceptual único

La zona de referencia es «FIE - Escuela ELECTRONICA», nombre existente en `data/base/edificios.geojson` para el objeto `way/498940529`. El punto ilustrativo se ubica junto al edificio y representa una rampa completamente simulada, en estado `adecuado` y apta para movilidad reducida dentro de la demostración.

**La existencia física de una rampa en esta ubicación no ha sido verificada. El ejemplo no acredita una instalación real ni condiciones reales de accesibilidad.** Se incluye únicamente en este documento y no se guarda como archivo de datos.

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [-78.67761, -1.65539]
  },
  "properties": {
    "id": "ACC-001",
    "tipo": "rampa",
    "estado": "adecuado",
    "descripcion": "Rampa ficticia de demostración junto al edificio de referencia, considerada adecuada y apta para movilidad reducida solo en el escenario simulado. Su existencia física no ha sido verificada.",
    "zona": "FIE - Escuela ELECTRONICA",
    "apto_movilidad_reducida": true,
    "es_simulado": true
  }
}
```

# Modelo de rutas demostrativas — ESPOCH Pulse

## Propósito

Las rutas permitirán demostrar cómo ESPOCH Pulse podría ofrecer distintas alternativas de desplazamiento dentro del campus utilizando información GIS.

La prueba de concepto comparará principalmente una ruta `convencional`, orientada a mostrar un trayecto más directo, y una ruta `accesible`, orientada a personas con movilidad reducida y diseñada para evitar elementos no aptos del escenario simulado.

La futura capa será `data/simulated/rutas.geojson`, una `FeatureCollection` con geometrías `LineString` en WGS84 / EPSG:4326, en orden longitud–latitud.

Las rutas serán completamente simuladas y no se presentarán como recorridos oficialmente validados por la ESPOCH. Este documento solo define el modelo y un ejemplo conceptual; no genera la capa de rutas.

## Atributos

Cada `Feature` tendrá exactamente estos diez atributos en `properties`:

| Atributo | Tipo | Formato o valores permitidos | Descripción |
| --- | --- | --- | --- |
| `id` | string | `RUTA-001`, `RUTA-002`, etc. | Identificador único de la ruta simulada. |
| `nombre` | string | Texto descriptivo. | Nombre descriptivo de la ruta. |
| `tipo` | string | `convencional`, `accesible` | Alternativa de desplazamiento representada. |
| `origen` | string | Texto. | Nombre textual del punto o zona de inicio. |
| `destino` | string | Texto. | Nombre textual del punto o zona de llegada. |
| `distancia_m` | number | Distancia en metros, redondeada a un decimal. | Longitud calculada de la geometría de la ruta; no se inventará manualmente. |
| `apta_movilidad_reducida` | boolean | `true` para una ruta `accesible`; una ruta `convencional` podrá utilizar `false` cuando atraviese elementos no aptos del escenario. | Aptitud de la ruta exclusivamente dentro de la demostración. |
| `elementos_accesibilidad` | array de strings | IDs existentes en `data/simulated/accesibilidad.geojson`; por ejemplo, `["ACC-001", "ACC-002", "ACC-003", "ACC-007"]`. | Elementos relevantes para explicar la ruta. |
| `descripcion` | string | Texto breve. | Explicación del criterio utilizado para la ruta y de su carácter simulado. |
| `es_simulado` | boolean | Siempre `true`. | Identifica explícitamente el carácter ficticio del recorrido. |

## Reglas

- Las coordenadas estarán únicamente en la geometría `LineString`; no se repetirán como atributos.
- Las rutas deberán ubicarse completamente dentro del campus, utilizando `data/base/campus.geojson` como límite de referencia.
- Para construir recorridos plausibles se utilizarán como referencia las geometrías reales de `data/base/vias.geojson`.
- Las rutas no deberán atravesar edificios; se comprobará su relación con las huellas de `data/base/edificios.geojson`.
- No se modificará `data/base/vias.geojson`.
- Las dos rutas utilizadas para una comparación deberán compartir el mismo origen y destino, tanto en sus referencias textuales como en las coordenadas de sus extremos.
- Una ruta `accesible` deberá evitar elementos de tipo `escalera`, elementos de tipo `obstaculo` y cualquier elemento con `apto_movilidad_reducida=false`.
- La ruta accesible podrá utilizar como referencia elementos `rampa`, `acceso` y `cruce` aptos.
- La ruta convencional podrá ser más corta aunque encuentre elementos que la hagan no apta para movilidad reducida dentro del escenario simulado.
- `distancia_m` se calculará a partir de la geometría completa de la ruta mediante un cálculo métrico apropiado y se redondeará a un decimal. Puede emplearse la suma de distancias geodésicas sobre el elipsoide WGS84 o una proyección métrica adecuada al campus. No se calculará una longitud en grados como si fueran metros ni se asignará una distancia manualmente.
- `elementos_accesibilidad` contendrá únicamente IDs que existan en `data/simulated/accesibilidad.geojson`. Referenciar un elemento no modifica su registro fuente.
- Todos los recorridos y condiciones serán simulados.
- Las rutas no certificarán condiciones reales de accesibilidad ni navegación del campus.
- Todos los registros tendrán `es_simulado=true`.

## Escenario previsto

La primera demostración utilizará los elementos `ACC-001`, `ACC-002`, `ACC-003`, `ACC-004`, `ACC-005`, `ACC-006` y `ACC-007` del sector FIE.

| Elemento | Papel previsto |
| --- | --- |
| `ACC-001` | Acceso apto; referencia común de inicio. |
| `ACC-002` | Escalera no apta relacionada con la alternativa convencional. |
| `ACC-003` | Obstáculo no apto relacionado con la alternativa convencional. |
| `ACC-004` | Rampa apta de referencia para la alternativa accesible. |
| `ACC-005` | Rampa apta de referencia para la alternativa accesible. |
| `ACC-006` | Cruce apto de referencia para la alternativa accesible. |
| `ACC-007` | Acceso apto; referencia común de llegada. |

La ruta convencional podrá relacionarse con `ACC-002` y `ACC-003`. La ruta accesible deberá evitarlos y utilizar una alternativa apoyada en elementos aptos como `ACC-004`, `ACC-005` y `ACC-006`.

`ACC-007` tiene estado `requiere_atencion`, pero conserva `apto_movilidad_reducida=true`: en el escenario existente, la atención pendiente corresponde a señalización y no a una barrera física.

Esta disposición es únicamente un escenario de demostración. La construcción y validación de ambas rutas se realizará en una etapa posterior.

## Ejemplo conceptual único

La siguiente `Feature` muestra únicamente la estructura del modelo. Su geometría ilustrativa sigue un tramo de referencia de las vías base entre las coordenadas de `ACC-001` y `ACC-007`. No se guarda como capa ni constituye una ruta operativa o validada oficialmente.

El valor `distancia_m=33.9` se calculó sumando las distancias geodésicas de los segmentos mostrados sobre el elipsoide WGS84 y redondeando a un decimal; no es una distancia inventada.

```json
{
  "type": "Feature",
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [-78.6761788, -1.6551578],
      [-78.6761374, -1.6551594],
      [-78.6760719, -1.6551919],
      [-78.6759375, -1.6553275]
    ]
  },
  "properties": {
    "id": "RUTA-001",
    "nombre": "SIMULADA: alternativa convencional junto a Aulas Nuevas FIE",
    "tipo": "convencional",
    "origen": "Acceso simulado ACC-001 — Aulas Nuevas FIE",
    "destino": "Acceso simulado ACC-007 — Aulas Nuevas FIE",
    "distancia_m": 33.9,
    "apta_movilidad_reducida": false,
    "elementos_accesibilidad": ["ACC-001", "ACC-002", "ACC-003", "ACC-007"],
    "descripcion": "Ejemplo conceptual de recorrido simulado más directo, relacionado con una escalera y un obstáculo ficticios que lo hacen no apto para movilidad reducida en la demostración. No certifica condiciones reales ni constituye un recorrido oficialmente validado por la ESPOCH.",
    "es_simulado": true
  }
}
```

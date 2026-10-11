# Modelo de códigos QR simulados — ESPOCH Pulse

## Propósito

Los códigos QR permitirán asociar lugares físicos del campus con servicios digitales de ESPOCH Pulse: identificar un edificio, consultar información del lugar, reportar una incidencia, acceder a servicios cercanos, consultar rutas o mostrar información de accesibilidad.

La futura capa será `data/simulated/puntos_qr.geojson`, una `FeatureCollection` con geometrías `Point` en WGS84 / EPSG:4326. Las coordenadas se almacenarán en orden longitud–latitud, dentro del campus.

Este documento define únicamente el modelo y un ejemplo conceptual. No crea puntos QR como datos ni afirma que existan códigos instalados.

## Atributos

Cada `Feature` tendrá exactamente los siguientes ocho atributos en `properties`:

| Atributo | Tipo | Formato o valores permitidos | Descripción |
| --- | --- | --- | --- |
| `id` | string | `QR-001`, `QR-002`, etc. | Identificador único del QR simulado. |
| `nombre` | string | Texto. | Nombre del lugar asociado. |
| `tipo_lugar` | string | `edificio`, `servicio`, `acceso`, `espacio` | Tipo de lugar asociado. |
| `accion_principal` | string | `informacion`, `reportar`, `navegacion`, `servicios` | Acción principal que ofrecería el QR. |
| `descripcion` | string | Texto breve. | Explicación de lo que ofrecería el QR. |
| `zona` | string | Texto. | Edificio o sector de referencia. |
| `url_demo` | string | `https://pulse.espoch.edu.ec/demo/qr/QR-001`, sustituyendo el último segmento por el `id` correspondiente. | Valor simulado que representa una futura ruta interna de ESPOCH Pulse. |
| `es_simulado` | boolean | Siempre `true`. | Identifica el carácter ficticio del QR. |

**El dominio `pulse.espoch.edu.ec` y todas las URL de este modelo son ficticios para la prueba de concepto. No se presentan como servicios oficiales, activos ni disponibles de la ESPOCH.**

## Reglas

- Las coordenadas se almacenarán únicamente en la geometría GeoJSON; no se añadirán atributos `lat` ni `lon`.
- Los QR de la prueba de concepto serán totalmente simulados.
- No se afirmará que actualmente existan códigos QR instalados en la ESPOCH.
- Los puntos deberán colocarse en ubicaciones plausibles junto a entradas, servicios o espacios del campus. Una ubicación de demostración no certifica una entrada real ni una instalación física.
- Se utilizarán principalmente edificios y sectores reales existentes en `data/base/edificios.geojson`.
- No se inventarán nombres de edificios si existe un nombre real disponible en la capa base.
- Los QR podrán ofrecer distintas acciones dependiendo del lugar, utilizando los valores permitidos de `accion_principal`.
- La demostración se concentrará principalmente en la FIE.
- Todos los registros tendrán `es_simulado=true`, como booleano y no como cadena de texto.
- Los identificadores serán únicos y el último segmento de `url_demo` coincidirá con el `id` del registro.

## Ejemplo conceptual único

El edificio de referencia es «FIE - Escuela ELECTRONICA», cuyo nombre consta en `data/base/edificios.geojson` para el objeto `way/498940529`. El QR, su ubicación propuesta y sus servicios digitales son ficticios. La coordenada ilustrativa se sitúa junto al edificio y no identifica una entrada verificada ni un QR instalado. Este ejemplo se conserva únicamente en el documento.

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [-78.67761, -1.65539]
  },
  "properties": {
    "id": "QR-001",
    "nombre": "FIE - Escuela ELECTRONICA",
    "tipo_lugar": "edificio",
    "accion_principal": "informacion",
    "descripcion": "QR ficticio de demostración: ofrecería información del edificio y opciones para reportar incidencias, consultar servicios, rutas e información de accesibilidad. No representa un código instalado.",
    "zona": "FIE - Escuela ELECTRONICA",
    "url_demo": "https://pulse.espoch.edu.ec/demo/qr/QR-001",
    "es_simulado": true
  }
}
```

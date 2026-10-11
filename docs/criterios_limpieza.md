# Criterios de limpieza GIS — ESPOCH Pulse

Referencia: [Inventario de datos](inventario_datos.md).

Este documento establece las reglas para futuras transformaciones desde `data/base/` hacia `data/processed/`. En este paso solo se documentan decisiones: no se modifican datos, no se crean capas procesadas ni se aplican las normalizaciones propuestas.

## Regla general

- `data/base/` contiene la información original obtenida de OpenStreetMap y nunca debe modificarse.
- `data/processed/` contendrá versiones adaptadas para la visualización y el funcionamiento de ESPOCH Pulse.
- Una transformación en `data/processed/` no significa que el dato original de OpenStreetMap sea incorrecto.
- No se inventarán nombres, capacidades, atributos ni geometrías reales que no estén respaldados por evidencia.
- Los datos simulados del Smart Campus permanecerán separados en `data/simulated/`.

## Campus

- Mantener la geometría actual de `data/base/campus.geojson` sin cambios, también como referencia para las futuras capas procesadas.

## Edificios

- No eliminar todavía ninguno de los 187 edificios actuales.
- Registrar como pendientes de revisión los siguientes objetos, sin añadir marcas ni modificar atributos en la capa fuente:

| Objeto OSM | Nombre | Etiquetas actuales relevantes |
| --- | --- | --- |
| `way/819653546` | Zona maniobras - Conduesposh | `building=yes`, `amenity=driving_school` |
| `way/819653547` | Area | `building=yes`, `amenity=driving_school` |
| `way/502198070` | FCP-AUDITORIO | `building=apartments`, `amenity=community_centre` |
| `way/502925051` | FCP-AUDITORIO | `building=apartments`, `amenity=library` |

- No corregir sus etiquetas hasta contar con evidencia suficiente.
- El nombre compartido por los dos objetos FCP-AUDITORIO no basta para considerarlos duplicados.

## Vías

- Mantener las 122 vías actuales.
- Documentar que diez geometrías que cruzaban el límite quedaron excluidas durante la obtención. Entre ellas estaban los accesos «Puerta 2 Espoch» (`way/109035523`) y «Puerta Posterior Espoch» (`way/128298698`), además de dos trazados de «Longitudinal 1». El listado completo consta en el inventario.
- Dejar la recuperación o el recorte de esos accesos como tarea futura, si resulta necesario para navegación. Cualquier resultado de esa tarea deberá guardarse en `data/processed/`, con su trazabilidad, sin alterar la capa fuente.

## Áreas verdes

- Mantener las cuatro áreas existentes.
- No crear áreas verdes manualmente en esta etapa.
- Documentar que OSM presenta cobertura limitada: las cuatro áreas conservadas tienen `leisure=park` y no constituyen un inventario completo de la vegetación real del campus.

## Parqueaderos

- Mantener intacta la capa original, con sus 27 elementos.
- Para una futura capa de visualización procesada, considerar ocultar o excluir únicamente de la representación los tres puntos contenidos en polígonos de estacionamiento, evitando mostrar aparentemente dos veces el mismo espacio:

| Punto candidato a ocultación | Polígono que lo contiene |
| --- | --- |
| `node/6975145503` | `way/745130190` |
| `node/7654086001` | `way/819653545` |
| `node/7654086029` | `way/819653552` |

- Esta decisión será una normalización de visualización, no una eliminación del dato fuente ni una declaración de que OSM es incorrecto.
- La coincidencia espacial indica posibles representaciones duplicadas; no demuestra por sí sola que sean el mismo espacio. La propuesta queda documentada, sin aplicarse todavía.

## Servicios

- Mantener intacta la capa original, con sus 34 elementos.
- Para una futura capa procesada, considerar evitar la doble representación de puntos contenidos en áreas con el mismo `amenity`:

| Punto candidato a normalización visual | Área que lo contiene | amenity compartido |
| --- | --- | --- |
| `node/6975134272` | `way/745130185` | `toilets` |
| `node/6975134273` | `way/745130184` | `restaurant` |
| `node/6975134274` | `way/745130192` | `toilets` |
| `node/6975145493` | `way/745130188` | `toilets` |
| `node/6975145498` | `way/745130189` | `bicycle_parking` |
| `node/6975145529` | `way/745130193` | `toilets` |
| `node/6975145536` | `way/745130193` | `toilets` |

- Estos siete puntos se relacionan con seis áreas. La posible normalización afectará solo a su representación procesada; no se eliminarán ni modificarán objetos en `data/base/`.
- Mantener «FCP-AUDITORIO» (`way/502925051`) con `amenity=library` como caso pendiente de revisión y no corregirlo todavía.

## Trazabilidad

Toda futura transformación deberá registrar:

- **Archivo fuente:** ruta del archivo original de `data/base/` utilizado.
- **Regla aplicada:** criterio concreto que se aplicó y acción realizada sobre la versión procesada.
- **Elementos afectados:** identificadores y tipos de objeto OSM, permitiendo relacionarlos con la fuente.
- **Motivo de la transformación:** razón de la adaptación y, cuando corresponda, evidencia que la respalda.

La trazabilidad deberá distinguir una normalización de visualización de una corrección respaldada por evidencia. Los casos pendientes seguirán pendientes hasta contar con información suficiente.

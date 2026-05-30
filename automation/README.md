# Automatización del blog — Nova Fumigaciones

Pipeline para publicar artículos nuevos sin tocar HTML a mano:

```
Claude Cowork (genera JSON)  →  n8n (ensambla + valida + commitea)  →  GitHub  →  Netlify (deploy auto)
```

## Principio de diseño

- **Cowork solo escribe contenido** (un JSON), nunca el HTML completo de la página.
- **`assemble.js` arma el HTML** rellenando las plantillas del repo y derivando los
  campos mecánicos (fecha legible, tiempo de lectura, slug, canonical, Open Graph, JSON-LD).
- El **índice y el sitemap se regeneran** desde `blog/articles.json` (la fuente de verdad).
  El artículo nuevo siempre queda como **destacado**, y el anterior pasa a la grilla.

## Archivos de esta carpeta

| Archivo | Para qué sirve |
|---|---|
| `cowork-prompt.md` | Contrato JSON + system prompt para Claude Cowork. |
| `assemble.js` | Ensamblador determinístico. Funciones puras para el Code node de n8n + CLI local. |
| `README.md` | Este documento. |

Archivos del repo que intervienen:
- `blog/_plantilla-articulo.html` — molde del artículo (con marcadores `{{...}}` y `noindex`).
- `blog/index.html` — índice (con marcadores `FEATURED:START/END` y `GRID:START/END`).
- `blog/articles.json` — manifiesto (listado de artículos, sin el cuerpo).
- `sitemap.xml` — se regenera completo.

## Probar localmente (requiere Node)

```bash
# 1. Guardá un JSON de ejemplo con la forma del contrato (ver cowork-prompt.md)
# 2. Dry-run (no escribe nada, solo valida e informa):
node automation/assemble.js ejemplo.json

# 3. Si todo OK, escribir los archivos en el repo:
node automation/assemble.js ejemplo.json --write
```

`assemble.js` aborta con error si la validación falla (marcadores sin reemplazar,
más de un `<h1>`, `noindex` presente, JSON-LD inválido, cuerpo demasiado corto, etc.).

## Workflow en n8n (nodos, en orden)

1. **Trigger** — manual, cron, o webhook (según cómo dispares la generación).

2. **Claude / Cowork** — genera el artículo según `cowork-prompt.md`.
   - Salida esperada: el objeto JSON del contrato.
   - Si el modelo devuelve texto extra, agregá un nodo que extraiga solo el JSON
     (o pedile salida JSON estricta).

3. **GitHub → Get file** ×3 (leer el estado actual del repo):
   - `blog/_plantilla-articulo.html`
   - `blog/index.html`
   - `blog/articles.json`
   - Guardá también el `sha` de `index.html`, `articles.json` y `sitemap.xml`
     (GitHub lo pide para actualizar archivos existentes).

4. **Code (JavaScript)** — pegá el bloque "FUNCIONES PURAS" de `assemble.js` y al final:
   ```js
   const cowork     = $('Cowork JSON').item.json;
   const tplArticle = $('Get plantilla').item.json.content;   // decodificar de base64 si hace falta
   const indexHtml  = $('Get index').item.json.content;
   const manifest   = typeof $('Get manifest').item.json.content === 'string'
                        ? JSON.parse($('Get manifest').item.json.content)
                        : $('Get manifest').item.json;
   return [{ json: buildAll({ cowork, tplArticle, indexHtml, manifest }) }];
   ```
   > Los nodos GitHub suelen devolver `content` en **base64**: decodificá con
   > `Buffer.from(content, 'base64').toString('utf8')` antes de pasarlo a `buildAll`.

   Si la validación falla, el nodo tira error y el workflow se detiene (no se publica nada roto).

5. **GitHub → Create/Update file** ×4 (commitear el resultado de `buildAll`):
   - Crear: `articlePath` con `articleHtml` (archivo nuevo).
   - Actualizar: `indexPath` con `indexHtml` (usar el `sha` leído en el paso 3).
   - Actualizar: `manifestPath` con `manifestJson` (usar su `sha`).
   - Actualizar: `sitemapPath` con `sitemapXml` (usar su `sha`).
   - Tip: para evitar conflictos de `sha`, podés hacer los 4 cambios en **un solo commit**
     usando la Git Data API (crear un tree con los 4 blobs). Con los nodos simples,
     4 commits seguidos también funcionan.
   - Mensaje de commit sugerido: `blog: publica "<titulo>"`.

6. **Netlify** — deploya solo al detectar el push. No requiere nodo extra.

## Notas y mantenimiento

- **Imágenes:** Cowork elige `imagen` de una lista permitida (ver `cowork-prompt.md`).
  Cuando subas fotos reales a `/assets/img/`, sumalas a esa lista y, si querés, pasá sus
  dimensiones reales en `imagen_w`/`imagen_h` (assemble.js usa un default si no vienen).
- **Estado vacío del índice:** lo maneja `assemble.js` solo (lo pone si no hay más
  artículos que el destacado, lo saca cuando hay).
- **Cache-bust de assets:** está en `ASSET_VER` dentro de `assemble.js`. Si cambiás CSS/JS
  y subís la versión en las páginas, actualizá también esa constante.
- **Idempotencia de slug:** si el slug ya existe, `assemble.js` agrega `-2`, `-3`, etc.
- **Fechas:** se toman del día de ejecución. Para re-publicar con otra fecha, pasá
  `todayIso` a `buildAll({ ..., todayIso: '2026-06-15' })`.

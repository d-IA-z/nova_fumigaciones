/* ═══════════════════════════════════════════════════════════════════
   NOVA FUMIGACIONES — assemble.js
   Ensamblador determinístico de artículos del blog.
   ───────────────────────────────────────────────────────────────────
   QUÉ HACE
     A partir del JSON que genera Claude Cowork (solo contenido) +
     las plantillas del repo, produce TODOS los archivos a commitear:
       · blog/<slug>.html          (artículo nuevo, ya sin noindex)
       · blog/index.html           (índice regenerado: destacado + grilla)
       · blog/articles.json        (manifiesto actualizado)
       · sitemap.xml               (regenerado)

   POR QUÉ ASÍ
     El LLM NO escribe HTML completo (frágil). Solo entrega contenido.
     Acá se rellenan plantillas y se derivan los campos mecánicos
     (fecha legible, tiempo de lectura, slug, canonical, etc.).

   USO EN n8n (Code node, lenguaje JavaScript)
     Pegá TODO el bloque "FUNCIONES PURAS" (entre las marcas indicadas).
     Recibí por $input: cowork (objeto), y los textos de las plantillas
     y el manifiesto actuales (leídos antes vía nodos GitHub "Get file").
     Devolvé el resultado de buildAll(...). Ejemplo al final de este archivo.

   USO LOCAL (para probar)
     node automation/assemble.js ruta/al/cowork.json          (dry-run: imprime)
     node automation/assemble.js ruta/al/cowork.json --write   (escribe los archivos)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ╔═══════════════════════════════════════════════════════════════════╗
   ║  FUNCIONES PURAS  — copiar desde aquí para el Code node de n8n      ║
   ╚═══════════════════════════════════════════════════════════════════╝ */

const SITE = 'https://novafumigaciones.com.ar';
const ASSET_VER = '20260530a';           // debe coincidir con el ?v= de styles/blog.css en las plantillas
const DEFAULT_IMG = { file: 'hero-fumigador.jpg', w: 1086, h: 1448 };
const WORDS_PER_MIN = 200;

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
               'agosto','septiembre','octubre','noviembre','diciembre'];

function htmlEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function jsonStr(s) {
  // Escapa para usar DENTRO de comillas en un bloque JSON-LD ya existente.
  return JSON.stringify(String(s)).slice(1, -1);
}
function stripTags(html) {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
}
function slugify(s) {
  return String(s).toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // quita acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
function readingTime(html) {
  const words = stripTags(html).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MIN));
}
function formatDateEs(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${d} de ${MESES[m - 1]}, ${y}`;
}
function uniqueSlug(slug, manifest) {
  const taken = new Set((manifest.articles || []).map(a => a.slug));
  if (!taken.has(slug)) return slug;
  let i = 2;
  while (taken.has(`${slug}-${i}`)) i++;
  return `${slug}-${i}`;
}

/* ── Derivación de campos a partir del JSON de Cowork ── */
function deriveArticle(cowork, manifest, todayIso) {
  const today = todayIso || new Date().toISOString().slice(0, 10);
  const baseSlug = slugify(cowork.slug_sugerido || cowork.titulo);
  const slug = uniqueSlug(baseSlug, manifest);
  const img = cowork.imagen || DEFAULT_IMG.file;
  return {
    slug,
    titulo: cowork.titulo,
    meta_description: cowork.meta_description,
    keywords: cowork.keywords || [],
    excerpt: cowork.excerpt,
    imagen: img,
    imagen_w: cowork.imagen_w || (img === DEFAULT_IMG.file ? DEFAULT_IMG.w : 1200),
    imagen_h: cowork.imagen_h || (img === DEFAULT_IMG.file ? DEFAULT_IMG.h : 800),
    alt_imagen: cowork.alt_imagen,
    fecha_iso: today,
    fecha_mod_iso: today,
    tiempo_lectura: readingTime(cowork.cuerpo_html),
    cuerpo_html: cowork.cuerpo_html
  };
}

/* ── Rellena la plantilla del artículo ── */
function renderArticle(tplArticle, a) {
  const data = {
    SLUG: a.slug,
    TITULO: a.titulo,
    META_DESCRIPTION: a.meta_description,
    KEYWORDS: (a.keywords || []).join(', '),
    FECHA_ISO: a.fecha_iso,
    FECHA_MOD_ISO: a.fecha_mod_iso,
    FECHA_LEGIBLE: formatDateEs(a.fecha_iso),
    TIEMPO_LECTURA: String(a.tiempo_lectura),
    IMAGEN: a.imagen,
    IMAGEN_W: String(a.imagen_w),
    IMAGEN_H: String(a.imagen_h),
    ALT_IMAGEN: a.alt_imagen,
    CUERPO: a.cuerpo_html        // RAW: no se escapa (es HTML)
  };

  let out = tplArticle;

  // 1) Quitar la meta noindex (y su comentario) → el artículo SÍ se indexa.
  out = out.replace(
    /\s*<!--[^>]*AUTOMATIZACIÓN[^>]*-->\s*\n\s*<meta name="robots" content="noindex">/,
    ''
  );
  // Red de seguridad por si el comentario cambió:
  out = out.replace(/\s*<meta name="robots" content="noindex">/, '');

  // 2) JSON-LD: reemplazar marcadores con escape JSON dentro de cada <script>.
  out = out.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/g,
    block => block.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in data ? jsonStr(data[k]) : m))
  );

  // 3) Resto del documento: CUERPO va RAW; los demás con escape HTML.
  out = out.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in data)) return m;
    return k === 'CUERPO' ? data[k] : htmlEsc(data[k]);
  });

  return out;
}

/* ── Fragmentos del índice ── */
const ARROW = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>';
const ARROW_SM = ARROW.replace(/width="16" height="16"/, 'width="14" height="14"');

function renderFeatured(a) {
  const url = `/blog/${a.slug}`;
  return `
    <section class="blog-featured reveal" aria-label="Artículo destacado">
      <article class="featured-card">
        <a class="featured-media" href="${url}" aria-label="Leer: ${htmlEsc(a.titulo)}">
          <span class="featured-tag">Destacado</span>
          <img src="/assets/img/${htmlEsc(a.imagen)}" alt="${htmlEsc(a.alt_imagen)}" width="${a.imagen_w}" height="${a.imagen_h}" loading="eager">
        </a>
        <div class="featured-body">
          <time class="post-date" datetime="${a.fecha_iso}">${formatDateEs(a.fecha_iso)}</time>
          <h2 class="featured-title">
            <a href="${url}">${htmlEsc(a.titulo)}</a>
          </h2>
          <p class="featured-excerpt">${htmlEsc(a.excerpt)}</p>
          <a href="${url}" class="btn btn-wa" style="background:var(--red);box-shadow:none;">
            Seguir leyendo
            ${ARROW}
          </a>
        </div>
      </article>
    </section>`;
}

function renderCard(a) {
  const url = `/blog/${a.slug}`;
  return `
        <article class="blog-card">
          <a class="blog-card-media" href="${url}" aria-label="Leer: ${htmlEsc(a.titulo)}">
            <img src="/assets/img/${htmlEsc(a.imagen)}" alt="${htmlEsc(a.alt_imagen)}" width="${a.imagen_w}" height="${a.imagen_h}" loading="lazy">
          </a>
          <div class="blog-card-body">
            <time class="post-date" datetime="${a.fecha_iso}">${formatDateEs(a.fecha_iso)}</time>
            <h3 class="blog-card-title"><a href="${url}">${htmlEsc(a.titulo)}</a></h3>
            <p class="blog-card-excerpt">${htmlEsc(a.excerpt)}</p>
            <a href="${url}" class="blog-card-link">
              Leer más
              ${ARROW_SM}
            </a>
          </div>
        </article>`;
}

const EMPTY_STATE =
  '<p class="blog-empty">Pronto vamos a sumar más notas sobre control de plagas, prevención y cuidado de tu hogar. ¡Volvé a visitarnos!</p>';

/* ── Regenera el índice usando los marcadores FEATURED y GRID ── */
function renderIndex(indexHtml, manifest) {
  const arts = manifest.articles || [];
  const featuredHtml = arts.length ? renderFeatured(arts[0]) : '';
  const rest = arts.slice(1);
  const gridHtml = rest.length
    ? rest.map(renderCard).join('\n')
    : '\n        ' + EMPTY_STATE + '\n';

  let out = indexHtml.replace(
    /(<!-- FEATURED:START -->)[\s\S]*?(<!-- FEATURED:END -->)/,
    (m, s, e) => `${s}${featuredHtml}\n    ${e}`
  );
  out = out.replace(
    /(<!-- GRID:START -->)[\s\S]*?(<!-- GRID:END -->)/,
    (m, s, e) => `${s}\n${gridHtml}\n        ${e}`
  );
  return out;
}

/* ── Regenera el sitemap ── */
function renderSitemap(manifest) {
  const arts = manifest.articles || [];
  const newest = arts.length ? arts[0].fecha_mod_iso : '2026-05-30';
  const urls = [
    { loc: `${SITE}/`, lastmod: '2026-05-23', cf: 'monthly', pr: '1.0' },
    { loc: `${SITE}/blog/`, lastmod: newest, cf: 'weekly', pr: '0.8' },
    ...arts.map(a => ({
      loc: `${SITE}/blog/${a.slug}`, lastmod: a.fecha_mod_iso, cf: 'monthly', pr: '0.7'
    }))
  ];
  const body = urls.map(u =>
    `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.cf}</changefreq>\n    <priority>${u.pr}</priority>\n  </url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/* ── Validación previa al commit (aborta si algo está mal) ── */
function validate(articleHtml, a) {
  const errors = [];
  const leftovers = articleHtml.match(/\{\{\w+\}\}/g);
  if (leftovers) errors.push('Marcadores sin reemplazar: ' + leftovers.join(', '));
  const h1 = (articleHtml.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) errors.push(`Debe haber exactamente 1 <h1> (hay ${h1}).`);
  if (/content="noindex"/.test(articleHtml)) errors.push('El artículo final NO debe tener noindex.');
  if (!a.titulo) errors.push('Falta titulo.');
  if (!a.meta_description) errors.push('Falta meta_description.');
  if (!a.alt_imagen) errors.push('Falta alt_imagen.');
  if (!a.cuerpo_html || stripTags(a.cuerpo_html).trim().length < 300)
    errors.push('Cuerpo demasiado corto o vacío.');
  // JSON-LD parseable
  const blocks = articleHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  blocks.forEach((b, i) => {
    const json = b.replace(/<\/?script[^>]*>/g, '');
    try { JSON.parse(json); } catch (e) { errors.push(`JSON-LD #${i + 1} inválido: ${e.message}`); }
  });
  return errors;
}

/* ── Orquestador: de cowork + plantillas + manifiesto → todos los archivos ── */
function buildAll({ cowork, tplArticle, indexHtml, manifest, todayIso }) {
  const a = deriveArticle(cowork, manifest, todayIso);
  const articleHtml = renderArticle(tplArticle, a);

  const errors = validate(articleHtml, a);
  if (errors.length) {
    const err = new Error('Validación falló:\n - ' + errors.join('\n - '));
    err.validationErrors = errors;
    throw err;
  }

  // Entrada de manifiesto (sin el cuerpo: el manifiesto es liviano)
  const entry = {
    slug: a.slug, titulo: a.titulo, meta_description: a.meta_description,
    keywords: a.keywords, excerpt: a.excerpt, imagen: a.imagen,
    imagen_w: a.imagen_w, imagen_h: a.imagen_h, alt_imagen: a.alt_imagen,
    fecha_iso: a.fecha_iso, fecha_mod_iso: a.fecha_mod_iso, tiempo_lectura: a.tiempo_lectura
  };
  const newManifest = Object.assign({}, manifest, {
    articles: [entry, ...(manifest.articles || [])]   // el nuevo va PRIMERO (destacado)
  });

  return {
    articlePath: `blog/${a.slug}.html`,
    articleHtml,
    indexPath: 'blog/index.html',
    indexHtml: renderIndex(indexHtml, newManifest),
    manifestPath: 'blog/articles.json',
    manifestJson: JSON.stringify(newManifest, null, 2) + '\n',
    sitemapPath: 'sitemap.xml',
    sitemapXml: renderSitemap(newManifest),
    canonical: `${SITE}/blog/${a.slug}`,
    meta: entry
  };
}

/* ╔═══════════════════════════════════════════════════════════════════╗
   ║  FIN FUNCIONES PURAS — hasta aquí para n8n                          ║
   ╚═══════════════════════════════════════════════════════════════════╝ */


/* ───────────────────────────────────────────────────────────────────
   EJEMPLO PARA EL Code NODE DE n8n (referencia, no se ejecuta en CLI)

   const cowork     = $('Cowork JSON').item.json;          // salida del LLM
   const tplArticle = $('Get plantilla').item.json.content; // _plantilla-articulo.html
   const indexHtml  = $('Get index').item.json.content;     // blog/index.html
   const manifest   = $('Get manifest').item.json;          // blog/articles.json (parseado)
   return [{ json: buildAll({ cowork, tplArticle, indexHtml, manifest }) }];
   ─────────────────────────────────────────────────────────────────── */


/* ───────────────────────────────────────────────────────────────────
   CLI LOCAL (Node) — para probar contra los archivos reales del repo.
   ─────────────────────────────────────────────────────────────────── */
if (typeof require !== 'undefined' && require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const repo = path.resolve(__dirname, '..');

  const coworkPath = process.argv[2];
  const doWrite = process.argv.includes('--write');
  if (!coworkPath) {
    console.error('Uso: node automation/assemble.js <cowork.json> [--write]');
    process.exit(1);
  }

  const cowork = JSON.parse(fs.readFileSync(coworkPath, 'utf8'));
  const tplArticle = fs.readFileSync(path.join(repo, 'blog/_plantilla-articulo.html'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(repo, 'blog/index.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'blog/articles.json'), 'utf8'));

  let res;
  try {
    res = buildAll({ cowork, tplArticle, indexHtml, manifest });
  } catch (e) {
    console.error('✗ ' + e.message);
    process.exit(1);
  }

  console.log('✓ Validación OK');
  console.log('  Artículo : ' + res.articlePath);
  console.log('  Canonical: ' + res.canonical);
  console.log('  Lectura  : ' + res.meta.tiempo_lectura + ' min');

  if (doWrite) {
    fs.writeFileSync(path.join(repo, res.articlePath), res.articleHtml);
    fs.writeFileSync(path.join(repo, res.indexPath), res.indexHtml);
    fs.writeFileSync(path.join(repo, res.manifestPath), res.manifestJson);
    fs.writeFileSync(path.join(repo, res.sitemapPath), res.sitemapXml);
    console.log('✓ Archivos escritos en el repo.');
  } else {
    console.log('\n(dry-run) Volvé a correr con --write para escribir los archivos.');
  }
}

/* Export para tests / n8n (si se usa require) */
if (typeof module !== 'undefined') {
  module.exports = {
    slugify, readingTime, formatDateEs, deriveArticle, renderArticle,
    renderIndex, renderSitemap, validate, buildAll
  };
}

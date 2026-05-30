# Nova Fumigaciones — Sitio web

Sitio estático con backend serverless en Netlify Functions.
Stack: HTML + CSS + Vanilla JS + Leaflet (CDN) + Airtable + Resend (opcional).

---

## 📁 Estructura

```
WEB_Nova/
├── index.html
├── assets/
│   ├── css/styles.css
│   ├── js/main.js · map.js
│   └── img/ (hero-fumigador.jpg, sobre-nosotros.jpg, og-image.jpg, favicon.svg)
├── netlify/functions/lead.js     ← backend
├── netlify.toml                  ← config Netlify
├── robots.txt
├── sitemap.xml
└── README.md (este archivo)
```

---

## 🚀 Deploy en Netlify (3 minutos)

1. Ir a [app.netlify.com](https://app.netlify.com) → **Add new site** → **Deploy manually**.
2. **Arrastrá la carpeta `WEB_Nova` completa** al área de deploy.
3. Netlify la sube y te da una URL temporal (ej. `nova-fumigaciones-xyz.netlify.app`).
4. (Opcional) En **Domain settings** → conectá tu dominio propio (`novafumigaciones.com.ar`).

**Listo, la web está online.** Pero el formulario todavía cae al fallback de WhatsApp hasta que configures Airtable abajo.

---

## 🗄️ Configurar Airtable (5 minutos)

### 1. Crear la base de Leads

1. Entrá a [airtable.com](https://airtable.com) → **Create a base** → llamala `Nova CRM`.
2. Renombrá la tabla por defecto a `Leads`.
3. Configurá estos campos (importante: nombres EXACTOS, respetando mayúsculas):

| Nombre del campo | Tipo            |
|------------------|-----------------|
| `Nombre`         | Single line text |
| `Telefono`       | Phone number     |
| `Email`          | Email            |
| `Servicio`       | Single select (o Single line text) |
| `Zona`           | Single line text |
| `Mensaje`        | Long text        |
| `Fecha`          | Date/Time (with time)   |
| `Origen`         | Single select (con opción "Sitio web") |
| `Estado`         | Single select (opcional, para tu workflow: Nuevo, Contactado, Cerrado) |

### 2. Obtener credenciales

- **Personal Access Token:** [airtable.com/create/tokens](https://airtable.com/create/tokens) → **Create token**:
  - Scopes: `data.records:write`
  - Access: tu base `Nova CRM`
  - Copiá el token (empieza con `pat...`).
- **Base ID:** abrí la base en el navegador. La URL es `airtable.com/appXXXXXXXXXX/...` — el `appXXXXXXXXXX` es tu Base ID.

### 3. Configurar en Netlify

En el dashboard de Netlify → tu sitio → **Site configuration → Environment variables** → **Add a variable**, agregá:

| Variable           | Valor                                  |
|--------------------|----------------------------------------|
| `AIRTABLE_TOKEN`   | `pat...` (tu token)                    |
| `AIRTABLE_BASE_ID` | `appXXXXXXXXXX`                        |
| `AIRTABLE_TABLE`   | `Leads`                                |

Luego en **Deploys** → **Trigger deploy** → **Deploy site** para que las env vars se apliquen.

**Probá el formulario:** completá una consulta de prueba en la web → debería aparecer en tu Airtable en segundos.

---

## 📧 (Opcional) Email automático al cliente

Si querés que el lead reciba un email de confirmación + vos un email interno por cada consulta:

### 1. Crear cuenta en Resend

1. Entrá a [resend.com](https://resend.com) → registrate (gratis hasta 100 mails/día, 3000/mes).
2. **Verificá tu dominio** (`novafumigaciones.com.ar`) en Resend → te da unos registros DNS para agregar en tu proveedor de dominio.
3. Una vez verificado, creá un API Key.

### 2. Agregar más env vars en Netlify

| Variable        | Valor                                                          |
|-----------------|----------------------------------------------------------------|
| `RESEND_API_KEY`| `re_...` (tu API key de Resend)                                 |
| `RESEND_FROM`   | `Nova Fumigaciones <contacto@novafumigaciones.com.ar>`         |
| `NOTIFY_EMAIL`  | `novafumigaciones49@gmail.com` (donde llegan los avisos internos) |

Re-deployá el sitio. Ahora cada lead:
- Se guarda en Airtable
- Recibe email de confirmación
- Vos recibís email con los datos en `novafumigaciones49@gmail.com`

**Si no querés usar Resend ahora:** dejá esas 3 variables sin configurar. El form sigue funcionando (guarda en Airtable + el cliente puede contactarte por WhatsApp).

---

## 🔧 Cómo actualizar el sitio

Si querés cambiar algo:
1. Editás el archivo localmente.
2. **Bumpeás la fecha del cache-buster:** en `index.html` buscá `?v=20260521` y cambiala por la fecha de hoy (formato `YYYYMMDD`). Esto fuerza a los navegadores a descargar la versión nueva.
3. Arrastrás la carpeta otra vez a Netlify (mismo lugar de deploy).

---

## 🎨 Personalizar

- **Colores:** en `assets/css/styles.css`, sección `:root` arriba de todo. Cambiá `--red`, `--bg`, etc.
- **Textos:** en `index.html`. Mantené las clases CSS para no romper estilos.
- **Servicios:** dentro de `<div class="svc-grid">` agregás o quitás `<article class="svc">...</article>`. Mantené múltiplos de 4 para grilla pareja.
- **Zonas del mapa:** en `assets/js/map.js`, objeto `ZONES`. Agregás/quitás zonas con sus coordenadas. Las coords las sacás de Google Maps (click derecho → "Qué hay aquí" → copiás los números).
- **WhatsApp:** buscá `542212019320` en el código y reemplazá si cambia el número.

---

## ✅ Checklist post-deploy

- [ ] La web carga en la URL de Netlify
- [ ] El hero tiene la foto del fumigador blanco
- [ ] El mapa carga con polígono rojo y markers en cada zona
- [ ] El marquee scrollea infinito sin saltos
- [ ] El FAQ abre/cierra al click
- [ ] El form funciona (probá enviar uno de prueba)
- [ ] El lead aparece en Airtable
- [ ] (Si configuraste Resend) llega el email de confirmación
- [ ] El menú hamburguesa funciona en mobile
- [ ] La preview de WhatsApp/Facebook muestra la foto al compartir el link

---

## 🆘 Problemas comunes

| Problema | Solución |
|----------|----------|
| El form siempre cae a WhatsApp | Falta configurar `AIRTABLE_TOKEN` y `AIRTABLE_BASE_ID` en Netlify env vars. |
| Lead llega a Airtable con campos vacíos | Los nombres de los campos en Airtable no coinciden EXACTAMENTE con los del backend (case-sensitive). Revisá la tabla del paso 1. |
| El mapa no carga | Falla de red al CDN de Leaflet. La página sigue funcionando, los chips de zonas se muestran igual. |
| Cambié algo y no se ve actualizado | Cache. Bumpeá el `?v=YYYYMMDD` en `index.html`, redeployá, y abrí en ventana incógnito para ver la versión fresca. |

---

Hecho con ❤️ por dIAz Integrations.

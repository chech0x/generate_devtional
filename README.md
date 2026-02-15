# 📖 Devocionales Tools - Node.js Scripts

Herramientas para generar RSS de podcast y convertir devocionales de WordPress a HTML.

## 🚀 Inicio Rápido

```bash
# Ejecutar todo automáticamente
node generate-all.js

# O ejecutar individualmente
node generate-podcast-rss.js   # Generar RSS
node parse-devotional-json.js  # Parsear JSON a HTML
```

## 📁 Archivos Incluidos

| Archivo | Descripción |
|---------|-------------|
| `generate-podcast-rss.js` | Genera RSS XML para Spotify Podcasts |
| `parse-devotional-json.js` | Convierte JSON de WordPress a HTML |
| `generate-all.js` | Ejecuta ambos scripts automáticamente |
| `package.json` | Configuración del proyecto Node.js |

## 📻 Script 1: Generador RSS de Podcast

Genera `podcast.xml` compatible con Spotify, Apple Podcasts, Google Podcasts.

**Uso:**
```bash
node generate-podcast-rss.js
```

**Resultado:**
- ✅ `podcast.xml` - RSS para agregadores
- ✅ `episodes-list.json` - Lista de episodios

## 📝 Script 2: Parser JSON a HTML

Convierte posts de WordPress en archivos HTML individuales.

**Uso básico:**
```bash
node parse-devotional-json.js
```

Por defecto, obtiene los datos desde: `https://cenfolic.com/wordpress/wp-json/wp/v2/posts`

**Variables de entorno:**

Personaliza el comportamiento del script:

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `DEVO_JSON_SOURCE` | URL de la API o ruta al archivo JSON | `https://cenfolic.com/wordpress/wp-json/wp/v2/posts` |
| `DEVO_CENFOLIC_BASE_URL` | URL base para endpoints de cenfolic | `https://cenfolic.com` |
| `DEVO_TEMPLATE_PATH` | Ruta al template HTML | `./devocional-template_placeholders.html` |
| `DEVO_OUTPUT_DIR` | Directorio de salida | `./output` |
| `DEVO_GENERATE_IMAGES` | Generar imágenes PNG (`true`/`false`) | `false` |
| `DEVO_IMAGE_WIDTH` | Ancho de las imágenes en píxeles | `1920` |
| `DEVO_AUDIO_SERVER_URL` | URL del servidor de archivos de audio | `https://cenfolic.com/audio/devo/` |
| `DEVO_AUDIO_HASH_SUFFIXES` | Sufijos de hash remoto separados por coma | `.hash,.mp3.hash` |
| `DEVO_DOWNLOAD_AUDIO` | Descargar archivos MP3 localmente (`true`/`false`) | `false` |

**Ejemplos:**

```bash
# Usar archivo JSON local
DEVO_JSON_SOURCE=demo-json.json node parse-devotional-json.js

# Generar imágenes PNG (requiere: npm install puppeteer)
DEVO_GENERATE_IMAGES=true node parse-devotional-json.js

# Generar imágenes con ancho personalizado
DEVO_GENERATE_IMAGES=true DEVO_IMAGE_WIDTH=1080 node parse-devotional-json.js

# Usar API diferente
DEVO_JSON_SOURCE=https://otro-sitio.com/wp-json/wp/v2/posts node parse-devotional-json.js

# Configurar servidor de audio personalizado
DEVO_AUDIO_SERVER_URL=https://mi-servidor.com/audios/ node parse-devotional-json.js

# Descargar archivos de audio localmente
DEVO_DOWNLOAD_AUDIO=true node parse-devotional-json.js

# Generar todo: HTML, imágenes PNG y descargar audios
DEVO_GENERATE_IMAGES=true DEVO_DOWNLOAD_AUDIO=true node parse-devotional-json.js

# Combinar variables
DEVO_JSON_SOURCE=demo-json.json DEVO_GENERATE_IMAGES=true node parse-devotional-json.js
```

**Resultado:**
- ✅ Carpeta `output/` con archivos HTML individuales
- ✅ Carpeta `output/` con imágenes PNG (si `DEVO_GENERATE_IMAGES=true`)
- ✅ Carpeta `output/` con archivos MP3 (si `DEVO_DOWNLOAD_AUDIO=true`)

**Requisitos para generar imágenes:**
```bash
npm install puppeteer
```

## 📋 Publicar en Spotify

1. Ejecuta: `node generate-podcast-rss.js`
2. Sube `podcast.xml` a: `https://cenfolic.com/podcast.xml`
3. Sube archivos MP3 a: `https://cenfolic.com/audio/devo/`
4. Envía RSS a: [Spotify for Podcasters](https://podcasters.spotify.com/)

## 📚 Documentación Completa

Ver [INSTRUCCIONES_SCRIPTS_NODEJS.txt](INSTRUCCIONES_SCRIPTS_NODEJS.txt) para:
- Configuración detallada
- Personalización
- Solución de problemas
- Checklist completo

---

¡Éxito con tu podcast de devocionales! 🎉
# generate_devtional

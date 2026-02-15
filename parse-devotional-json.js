/**
 * Parser de JSON a HTML
 * Toma el JSON de WordPress y genera archivos HTML usando el template
 *
 * Variables de entorno:
 * - DEVO_CENFOLIC_BASE_URL: URL base de cenfolic (default: https://cenfolic.com)
 * - DEVO_JSON_SOURCE: URL de la API o ruta al archivo JSON (default: https://cenfolic.com/wordpress/wp-json/wp/v2/posts)
 * - DEVO_TEMPLATE_PATH: Ruta al template HTML (default: ./devocional-template_placeholders.html)
 * - DEVO_OUTPUT_DIR: Directorio de salida (default: ./output)
 * - DEVO_GENERATE_IMAGES: Generar imágenes PNG (default: false, valores: true/false)
 * - DEVO_IMAGE_WIDTH: Ancho de la imagen (default: 1920)
 * - DEVO_AUDIO_SERVER_URL: URL del servidor de audio (default: https://cenfolic.com/audio/devo/)
 * - DEVO_AUDIO_HASH_SUFFIXES: Sufijos de hash remoto separados por coma (default: .hash,.mp3.hash)
 * - DEVO_DOWNLOAD_AUDIO: Descargar archivos de audio localmente (default: false, valores: true/false)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { pathToFileURL } = require('url');

function loadEnvFile() {
  const envFilePath = process.env.DEVO_ENV_FILE || path.join(__dirname, '.env');
  if (!fs.existsSync(envFilePath)) return;

  const content = fs.readFileSync(envFilePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const cleaned = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separatorIndex = cleaned.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = cleaned.slice(0, separatorIndex).trim();
    let value = cleaned.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

// Importar puppeteer solo si se necesita
let puppeteer;
const GENERATE_IMAGES = process.env.DEVO_GENERATE_IMAGES === 'true';
if (GENERATE_IMAGES) {
  try {
    puppeteer = require('puppeteer');
  } catch (error) {
    console.warn('⚠️  Puppeteer no está instalado. Ejecuta: npm install puppeteer');
    console.warn('⚠️  Se continuará sin generar imágenes.\n');
  }
}

// ==========================================
// CONFIGURACIÓN
// ==========================================
const DOWNLOAD_AUDIO = process.env.DEVO_DOWNLOAD_AUDIO === 'true';
const CENFOLIC_BASE_URL = (process.env.DEVO_CENFOLIC_BASE_URL || 'https://cenfolic.com').replace(/\/+$/, '');
const AUDIO_HASH_SUFFIXES = (process.env.DEVO_AUDIO_HASH_SUFFIXES || '.hash,.mp3.hash')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const CONFIG = {
  jsonSource: process.env.DEVO_JSON_SOURCE || `${CENFOLIC_BASE_URL}/wordpress/wp-json/wp/v2/posts`,
  templatePath: process.env.DEVO_TEMPLATE_PATH || path.join(__dirname, 'devocional-template_placeholders.html'),
  outputDir: process.env.DEVO_OUTPUT_DIR || path.join(__dirname, 'output'),
  siteBaseUrl: process.env.DEVO_SITE_BASE_URL || 'https://www.devocional.info',
  generateImages: GENERATE_IMAGES && puppeteer !== undefined,
  imageWidth: parseInt(process.env.DEVO_IMAGE_WIDTH || '1080', 10),
  audioServerUrl: process.env.DEVO_AUDIO_SERVER_URL || `${CENFOLIC_BASE_URL}/audio/devo/`,
  audioHashSuffixes: AUDIO_HASH_SUFFIXES,
  downloadAudio: DOWNLOAD_AUDIO
};

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

/**
 * Obtiene datos JSON desde una URL o archivo local
 */
function fetchJsonData(source) {
  return new Promise((resolve, reject) => {
    // Si es una URL
    if (source.startsWith('http://') || source.startsWith('https://')) {
      const protocol = source.startsWith('https://') ? https : http;

      console.log(`📡 Obteniendo datos desde: ${source}`);

      const request = protocol.get(source, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            resolve(jsonData);
          } catch (error) {
            reject(new Error(`Error parseando JSON desde URL: ${error.message}`));
          }
        });
      }).on('error', (error) => {
        reject(new Error(`Error obteniendo datos desde URL: ${error.message}`));
      });

      // Timeout de 30 segundos
      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Timeout: La petición HTTP tardó más de 30 segundos'));
      });
    } else {
      // Es un archivo local
      try {
        console.log(`📄 Leyendo archivo local: ${source}`);
        const fileContent = fs.readFileSync(source, 'utf8');
        const jsonData = JSON.parse(fileContent);
        resolve(jsonData);
      } catch (error) {
        reject(new Error(`Error leyendo archivo local: ${error.message}`));
      }
    }
  });
}

/**
 * Genera una imagen PNG desde el HTML usando Puppeteer
 * Solo captura el elemento <article class="devocional">
 * @param {string} htmlFilePath - Ruta al archivo HTML
 * @param {string} outputPath - Ruta de salida para el PNG
 * @param {number} width - Ancho de la imagen
 * @param {object} browser - Instancia de navegador (opcional, si no se pasa se crea una nueva)
 */
async function generateImageFromHtml(htmlFilePath, outputPath, width = 1920, browser = null) {
  if (!puppeteer) {
    throw new Error('Puppeteer no está disponible');
  }

  const shouldCloseBrowser = !browser;
  if (!browser) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  let page;
  try {
    page = await browser.newPage();

    // Configurar viewport con el ancho especificado
    await page.setViewport({
      width: width,
      height: 1080,
      deviceScaleFactor: 3  // Aumentado a 3x para mejor calidad y texto más grande
    });

    // Cargar el HTML desde el archivo para que las rutas relativas funcionen
    const fileUrl = pathToFileURL(path.resolve(htmlFilePath)).href;
    await page.goto(fileUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000 // 30 segundos timeout
    });

    // Esperar a que el elemento article esté presente
    await page.waitForSelector('article.devocional', { timeout: 10000 });

    // Ocultar elementos con clase .no-screenshot (como el botón de descarga)
    await page.evaluate(() => {
      const elementsToHide = document.querySelectorAll('.no-screenshot');
      elementsToHide.forEach(el => el.style.display = 'none');
    });

    // Tomar screenshot solo del elemento article
    const element = await page.$('article.devocional');

    if (!element) {
      throw new Error('No se encontró el elemento <article class="devocional">');
    }

    await element.screenshot({
      path: outputPath,
      type: 'png'
    });

    return true;
  } finally {
    if (page) {
      await page.close(); // Cerrar la página para liberar memoria
    }
    if (shouldCloseBrowser) {
      await browser.close();
    }
  }
}

/**
 * Copia una carpeta al directorio de salida
 */
function copyFolder(folderName, outputDir) {
  const source = path.join(__dirname, folderName);
  const destination = path.join(outputDir, folderName);

  // Verificar si existe la carpeta
  if (!fs.existsSync(source)) {
    console.warn(`⚠️  Carpeta ${folderName} no encontrada, se omitirá la copia`);
    return;
  }

  // Crear carpeta en output si no existe
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  // Copiar todos los archivos de la carpeta
  const files = fs.readdirSync(source);
  files.forEach(file => {
    const srcFile = path.join(source, file);
    const destFile = path.join(destination, file);

    if (fs.statSync(srcFile).isFile()) {
      fs.copyFileSync(srcFile, destFile);
    }
  });

  console.log(`📁 Carpeta ${folderName} copiada a ${destination}`);
}

/**
 * Copia la carpeta images al directorio de salida
 */
function copyImagesFolder(outputDir) {
  copyFolder('images', outputDir);
}

/**
 * Copia la carpeta css al directorio de salida
 */
function copyCssFolder(outputDir) {
  copyFolder('css', outputDir);
}

/**
 * Copia la carpeta fonts al directorio de salida
 */
function copyFontsFolder(outputDir) {
  copyFolder('fonts', outputDir);
}

/**
 * Descarga un archivo de audio desde el servidor remoto
 */
function downloadAudioFile(audioUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = audioUrl.startsWith('https://') ? https : http;

    const request = protocol.get(audioUrl, (res) => {
      // Si el archivo no existe (404), resolver sin error
      if (res.statusCode === 404) {
        resolve(false);
        return;
      }

      // Si hay otro error HTTP, rechazar
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      // Crear stream para escribir el archivo
      const fileStream = fs.createWriteStream(outputPath);

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve(true);
      });

      fileStream.on('error', (error) => {
        fs.unlink(outputPath, () => {}); // Eliminar archivo parcial
        reject(error);
      });

    }).on('error', (error) => {
      reject(error);
    });

    // Timeout de 60 segundos para descargas de audio (archivos más grandes)
    request.setTimeout(60000, () => {
      request.destroy();
      fs.unlink(outputPath, () => {}); // Eliminar archivo parcial
      reject(new Error('Timeout: La descarga de audio tardó más de 60 segundos'));
    });
  });
}

/**
 * Descarga un archivo de texto remoto (por ejemplo, hash) desde el servidor.
 */
function downloadTextFile(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https://') ? https : http;

    const request = protocol.get(url, (res) => {
      if (res.statusCode === 404) {
        resolve(null);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (error) => {
      reject(error);
    });

    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Timeout: La descarga del hash tardó más de 30 segundos'));
    });
  });
}

/**
 * Normaliza el contenido de un archivo hash.
 */
function normalizeHashValue(raw) {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  const hashMatch = trimmed.match(/\b[a-f0-9]{32,128}\b/);
  if (hashMatch) {
    return hashMatch[0];
  }

  return trimmed;
}

/**
 * Escribe un archivo solo si el contenido cambió.
 */
function writeFileIfChanged(filePath, content) {
  ensureParentDir(filePath);
  if (fs.existsSync(filePath)) {
    const current = fs.readFileSync(filePath, 'utf8');
    if (current === content) {
      return false;
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

/**
 * Guarda hash local solo cuando hay un hash remoto distinto.
 */
function saveHashIfChanged(localHashPath, remoteHash) {
  if (!remoteHash) {
    return false;
  }

  const currentHash = fs.existsSync(localHashPath)
    ? normalizeHashValue(fs.readFileSync(localHashPath, 'utf8'))
    : null;
  if (currentHash === remoteHash) {
    return false;
  }

  ensureParentDir(localHashPath);
  fs.writeFileSync(localHashPath, `${remoteHash}\n`, 'utf8');
  return true;
}

function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureParentDir(filePath) {
  ensureDirExists(path.dirname(filePath));
}

/**
 * Determina si debe reprocesarse toda la fecha por estado de hash.
 */
function shouldForceRebuildForHash({ downloadAudioEnabled, remoteHash, localHash }) {
  return Boolean(
    downloadAudioEnabled &&
    remoteHash &&
    (!localHash || localHash !== remoteHash)
  );
}

function resolveLocalHashPaths(outputDir, dateSlug) {
  return {
    primary: path.join(outputDir, `${dateSlug}.hash`),
    legacy: path.join(outputDir, `${dateSlug}.mp3.hash`)
  };
}

function readLocalHash(primaryPath, legacyPath) {
  if (fs.existsSync(primaryPath)) {
    return normalizeHashValue(fs.readFileSync(primaryPath, 'utf8'));
  }
  if (legacyPath && fs.existsSync(legacyPath)) {
    return normalizeHashValue(fs.readFileSync(legacyPath, 'utf8'));
  }
  return null;
}

function buildProcessingPlan({ hashState, generateImagesEnabled, downloadAudioEnabled }) {
  if (hashState.reason === 'missing_remote_hash') {
    return { shouldProcess: false, reason: 'missing_remote_hash', processHtml: false, processImage: false, processAudio: false, shouldSaveHash: false };
  }
  if (hashState.reason === 'hash_unchanged') {
    return { shouldProcess: false, reason: 'hash_unchanged', processHtml: false, processImage: false, processAudio: false, shouldSaveHash: false };
  }

  return {
    shouldProcess: true,
    reason: 'hash_changed_or_new',
    processHtml: true,
    processImage: Boolean(generateImagesEnabled),
    processAudio: Boolean(downloadAudioEnabled),
    shouldSaveHash: true
  };
}

/**
 * Evalúa el estado de hash para decidir si se reprocesa una fecha.
 */
async function evaluateHashSyncState({ audioServerUrl, dateSlug, hashSuffixes, localHashPath }) {
  const localHash = readLocalHash(localHashPath.primary, localHashPath.legacy);

  let remoteHash = null;
  const remoteHashData = await fetchRemoteAudioHash(audioServerUrl, dateSlug, hashSuffixes);
  if (remoteHashData && remoteHashData.hash) {
    remoteHash = remoteHashData.hash;
  }

  if (!remoteHash) {
    return { shouldRebuild: false, reason: 'missing_remote_hash', remoteHash: null, localHash };
  }

  const shouldRebuild = shouldForceRebuildForHash({
    downloadAudioEnabled: true,
    remoteHash,
    localHash
  });

  return {
    shouldRebuild,
    reason: shouldRebuild ? 'hash_changed_or_new' : 'hash_unchanged',
    remoteHash,
    localHash
  };
}

/**
 * Busca hash remoto probando diferentes sufijos.
 */
async function fetchRemoteAudioHash(audioServerUrl, dateSlug, hashSuffixes) {
  const baseUrl = audioServerUrl.replace(/\/+$/, '');
  const suffixesToTry = (hashSuffixes && hashSuffixes.length > 0) ? hashSuffixes : ['.hash', '.mp3.hash'];

  for (const suffix of suffixesToTry) {
    const hashUrl = `${baseUrl}/${dateSlug}${suffix}`;
    const rawHash = await downloadTextFile(hashUrl);
    const normalized = normalizeHashValue(rawHash);
    if (normalized) {
      return {
        hash: normalized,
        url: hashUrl,
        suffix
      };
    }
  }

  return null;
}

/**
 * Elimina atributos style inline de las etiquetas HTML
 */
function removeInlineStyles(html) {
  if (!html) return '';
  // Remover atributos style de todas las etiquetas
  return html.replace(/\s+style="[^"]*"/gi, '').replace(/\s+style='[^']*'/gi, '');
}

/**
 * Extrae el texto limpio de HTML (sin etiquetas)
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>.*?<\/style>/gis, '')
    .replace(/<script[^>]*>.*?<\/script>/gis, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8230;/g, '...')
    .trim();
}

/**
 * Extrae la referencia bíblica del contenido
 */
function extractBibleRef(content) {
  // Buscar en el JSON el texto de cite o en blockquote
  const citeMatch = content.match(/<cite[^>]*>(.*?)<\/cite>/is);
  if (citeMatch) {
    return stripHtml(citeMatch[1]);
  }

  // Buscar patrones como "1 Juan 5:11-13 (NTV)" o "Salmo 23:1 (RVR1960)"
  const refMatch = content.match(/([1-3]?\s*[A-Za-záéíóúÁÉÍÓÚñÑ]+\s+\d+:\d+(?:[-–]\d+)?(?:,\s*\d+(?:[-–]\d+)?)*\s*[,.]?\s*\([A-Z0-9]+\))/);
  if (refMatch) {
    return refMatch[1];
  }

  return 'Salmo 119:71 (NTV)'; // Default
}

/**
 * Extrae el versículo principal
 */
function extractVerse(content) {
  // Buscar en blockquote
  const blockquoteMatch = content.match(/<blockquote[^>]*>(.*?)<\/blockquote>/is);
  if (blockquoteMatch) {
    let verse = stripHtml(blockquoteMatch[1]);
    // Remover la cita bíblica del texto (puede estar pegada sin espacio, acepta - o –, versiones con números)
    verse = verse.replace(/\s*[1-3]?\s*[A-Za-záéíóúÁÉÍÓÚñÑ]+\s+\d+:\d+(?:[-–]\d+)?(?:,\s*\d+(?:[-–]\d+)?)?\s*[,.]?\s*\([A-Z0-9]+\)/g, '').trim();
    return verse;
  }

  // Buscar en pullquote
  const pullquoteMatch = content.match(/<figure[^>]*class="wp-block-pullquote"[^>]*>(.*?)<\/figure>/is);
  if (pullquoteMatch) {
    let verse = stripHtml(pullquoteMatch[1]);
    verse = verse.replace(/\s*[1-3]?\s*[A-Za-záéíóúÁÉÍÓÚñÑ]+\s+\d+:\d+(?:[-–]\d+)?(?:,\s*\d+(?:[-–]\d+)?)?\s*[,.]?\s*\([A-Z0-9]+\)/g, '').trim();
    return verse;
  }

  return '"Me hizo bien haber sido afligido, porque así pude aprender tus estatutos"';
}

/**
 * Extrae el contenido del "Tesoro Bíblico"
 */
function extractBiblicalTreasure(content) {
  // Buscar todo el contenido después del versículo y antes de "Punto de Acción"
  let treasureContent = content;

  // Remover el header, fecha y versículo principal
  treasureContent = treasureContent.replace(/<div[^>]*class="wp-block-cover"[^>]*>.*?<\/div>/is, '');
  treasureContent = treasureContent.replace(/<div[^>]*class="wp-block-post-date"[^>]*>.*?<\/div>/is, '');
  treasureContent = treasureContent.replace(/<figure[^>]*class="wp-block-pullquote"[^>]*>.*?<\/figure>/is, '');

  // Remover el final (query block y párrafos vacíos)
  treasureContent = treasureContent.replace(/<div[^>]*class="wp-block-query"[^>]*>.*$/is, '');

  // Remover la etiqueta "Tesoro Bíblico" si existe (para extraer solo el contenido después)
  treasureContent = treasureContent.replace(/<p[^>]*is-style-text-subtitle[^>]*>.*?Tesoro Bíblico.*?<\/p>/is, '');

  // Remover divs wp-block-group que puedan estar envolviendo el contenido
  treasureContent = treasureContent.replace(/<div[^>]*class="wp-block-group[^"]*"[^>]*>/gi, '');
  treasureContent = treasureContent.replace(/<\/div>/gi, '');

  // Buscar hasta cualquiera de estos separadores que indican el inicio del "Punto de Acción":
  // 1. <p class="is-style-text-subtitle...">Punto de Acción</p>
  // 2. <hr> seguido de <p class="is-style-text-subtitle...">
  // 3. <h2 ... has-background ...>

  // Patrón 1: Buscar hasta "Punto de Acción" con is-style-text-subtitle
  const actionSeparatorMatch = treasureContent.match(/(.*?)(?=<p[^>]*is-style-text-subtitle[^>]*>.*?Punto de Acción)/is);
  if (actionSeparatorMatch) {
    let result = actionSeparatorMatch[1].trim();
    // Remover hrs finales que pueden preceder al punto de acción
    result = result.replace(/<hr[^>]*>\s*$/is, '');
    return result;
  }

  // Patrón 2: Buscar hasta hr seguido de is-style-text-subtitle
  const hrSeparatorMatch = treasureContent.match(/(.*?)(?=<hr[^>]*class="[^"]*has-alpha-channel[^"]*"[^>]*>\s*<p[^>]*is-style-text-subtitle)/is);
  if (hrSeparatorMatch) {
    return hrSeparatorMatch[1].trim();
  }

  // Patrón 3: Buscar hasta h2 que tiene background (indicador común del punto de acción)
  const h2SeparatorMatch = treasureContent.match(/(.*?)(?=<h2[^>]*has-background[^>]*>)/is);
  if (h2SeparatorMatch) {
    return h2SeparatorMatch[1].trim();
  }

  // Fallback: tomar todo el contenido pero removiendo hrs finales
  return treasureContent.replace(/<hr[^>]*>/gi, '').trim();
}

/**
 * Extrae el "Punto de Acción"
 */
function extractCallToAction(content) {
  // Remover el query block del final
  let actionContent = content.replace(/<div[^>]*class="wp-block-query"[^>]*>.*$/is, '');

  // Patrón 1: Buscar <p class="is-style-text-subtitle...">Punto de Acción</p> seguido del contenido
  const subtitleMatch = actionContent.match(/<p[^>]*is-style-text-subtitle[^>]*>.*?Punto de Acción.*?<\/p>(.*?)$/is);
  if (subtitleMatch) {
    return subtitleMatch[1].trim();
  }

  // Patrón 2: Buscar h2 con has-background (común en las llamadas a la acción)
  const h2Match = actionContent.match(/<h2[^>]*has-background[^>]*>(.*?)<\/h2>(.*?)$/is);
  if (h2Match) {
    // Incluir el título del h2 y el contenido siguiente
    return `<p><strong>${stripHtml(h2Match[1])}</strong></p>${h2Match[2].trim()}`;
  }

  // Patrón 3: Buscar frases comunes al inicio del punto de acción
  const phraseMatch = actionContent.match(/<p[^>]*>(?:Hoy identifica|Hoy puedes|Hoy reflexiona)[^<]*<\/p>(.*?)$/is);
  if (phraseMatch) {
    return phraseMatch[0].trim(); // Incluir el párrafo inicial también
  }

  return '<p>Reflexiona en este día sobre la Palabra de Dios y ponla en práctica.</p>';
}

/**
 * Formatea fecha de WordPress a formato legible español
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const diaSemana = dias[date.getDay()];
  const dia = date.getDate();
  const mes = meses[date.getMonth()];
  const año = date.getFullYear();

  return `${diaSemana.toUpperCase()} ${dia} DE ${mes.toUpperCase()} DE ${año}`;
}

/**
 * Obtiene la fecha del slug o link
 */
function getDateFromUrl(url) {
  const match = url.match(/(\d{4})\/(\d{2})\/(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

// ==========================================
// FUNCIÓN PRINCIPAL DE PARSEO
// ==========================================

function parseDevotional(postData, template, dateSlug, prevDevotional = null, nextDevotional = null) {
  const content = postData.content.rendered;

  // Calcular variante CSS basado en la fecha (mod 7 + 1)
  const dateNumeric = parseInt(dateSlug.replace(/-/g, ''), 10); // "2025-12-10" -> 20251210
  const cssVariantNumber = (dateNumeric % 7) + 1; // 0-6 -> 1-7
  const cssVariant = cssVariantNumber.toString().padStart(2, '0'); // 1 -> "01"

  const coverImage = `devo-${cssVariant}.jpg`;

  // Generar HTML de navegación
  let navigationHtml = '';

  if (prevDevotional) {
    navigationHtml += `
    <a href="${prevDevotional.htmlFile.replace('.html', '')}" class="nav-button nav-button--prev">
      <span class="nav-button__arrow">←</span>
      <div class="nav-button__content">
        <span class="nav-button__label">Anterior</span>
        <span class="nav-button__title">${prevDevotional.title}</span>
      </div>
    </a>`;
  }

  if (nextDevotional) {
    navigationHtml += `
    <a href="${nextDevotional.htmlFile.replace('.html', '')}" class="nav-button nav-button--next">
      <div class="nav-button__content">
        <span class="nav-button__label">Siguiente</span>
        <span class="nav-button__title">${nextDevotional.title}</span>
      </div>
      <span class="nav-button__arrow">→</span>
    </a>`;
  }

  // Extraer datos
  const devotionalTitle = removeInlineStyles(postData.title.rendered);
  const verseText = extractVerse(content);
  const verseRef = extractBibleRef(content);
  
  // Generar valores para Open Graph (usar devo-01 a devo-07.jpg para preview)
  const ogTitle = devotionalTitle;
  const ogDescription = verseText.length > 150 ? verseText.substring(0, 147) + '...' : verseText;
  const ogUrlPath = `${dateSlug}.html`;
  const ogImagePath = `images/${coverImage}`; // devo-01.jpg a devo-07.jpg para redes sociales
  const ogImageAlt = `${devotionalTitle} - ${verseRef}`;
  
  const data = {
    verse_ref: verseRef,
    date: formatDate(postData.date),
    verse_text: verseText,
    devotional_title: devotionalTitle,
    biblical_treasure: extractBiblicalTreasure(content),
    call_to_action: extractCallToAction(content),
    audio_filename: `${dateSlug}.mp3`,
    png_filename: `${dateSlug}.png`,
    css_variant: cssVariant,
    cover_image: coverImage,
    prev_next_navigation: navigationHtml,
    og_title: ogTitle,
    og_description: ogDescription,
    og_url_path: ogUrlPath,
    og_image_path: ogImagePath,
    og_image_alt: ogImageAlt
  };

  // Reemplazar placeholders
  let html = template;
  Object.keys(data).forEach(key => {
    const placeholder = `{{${key}}}`;
    html = html.replace(new RegExp(placeholder, 'g'), data[key]);
  });

  return html;
}

// ==========================================
// EJECUCIÓN PRINCIPAL
// ==========================================

async function main() {
  try {
    console.log('📖 Iniciando parser de devocionales...\n');
    console.log(`⚙️  Fuente de datos: ${CONFIG.jsonSource}`);
    console.log(`⚙️  Template: ${CONFIG.templatePath}`);
    console.log(`⚙️  Directorio de salida: ${CONFIG.outputDir}`);
    console.log(`⚙️  Servidor de audio: ${CONFIG.audioServerUrl}`);
    if (CONFIG.downloadAudio) {
      console.log(`⚙️  Descarga de audio: Activada`);
    }
    if (CONFIG.generateImages) {
      console.log(`⚙️  Generación de imágenes: Activada (${CONFIG.imageWidth}px de ancho)`);
    }
    console.log();

    // Crear directorio de salida si no existe
    ensureDirExists(CONFIG.outputDir);

    // Copiar carpetas de dependencias al directorio de salida
    copyImagesFolder(CONFIG.outputDir);
    copyCssFolder(CONFIG.outputDir);
    copyFontsFolder(CONFIG.outputDir);

    // Obtener datos (desde URL o archivo local)
    const jsonData = await fetchJsonData(CONFIG.jsonSource);

    // Leer template y reemplazar configuración global
    let template = fs.readFileSync(CONFIG.templatePath, 'utf8');

    // Si se descargan audios localmente, usar ruta relativa, sino usar servidor remoto
    const audioBaseUrl = CONFIG.downloadAudio ? './' : CONFIG.audioServerUrl;
    template = template.replace(/\{\{audio_server_url\}\}/g, audioBaseUrl);

    console.log(`✅ ${jsonData.length} devocionales encontrados\n`);

    // Array para almacenar metadata de los devocionales
    const devotionalsMetadata = [];

    // PRIMERA PASADA: Recopilar metadata de todos los devocionales
    console.log('📋 Recopilando metadata...\n');
    for (let index = 0; index < jsonData.length; index++) {
      const post = jsonData[index];
      const dateSlug = getDateFromUrl(post.link) || post.slug;
      const filename = `${dateSlug}.html`;
      const content = post.content.rendered;
      const dateNumeric = parseInt(dateSlug.replace(/-/g, ''), 10);
      const cssVariantNumber = (dateNumeric % 7) + 1;
      const cssVariant = cssVariantNumber.toString().padStart(2, '0');
      const bannerImage = `devo-${cssVariant}.jpg`;

      devotionalsMetadata.push({
        post: post,
        date: formatDate(post.date),
        dateSlug: dateSlug,
        title: removeInlineStyles(post.title.rendered),
        verseRef: extractBibleRef(content),
        verseText: extractVerse(content),
        htmlFile: filename,
        bannerImage: bannerImage,
        cssVariant: cssVariant
      });
    }

    // Ordenar por fecha descendente
    const sortedMetadata = devotionalsMetadata.sort((a, b) => b.dateSlug.localeCompare(a.dateSlug));

    // SEGUNDA PASADA: Generar HTML con navegación (en paralelo, lotes de 2)
    console.log('🔨 Generando archivos HTML...\n');
    const processingSummary = {
      changedOrNew: [],
      unchanged: [],
      missingRemoteHash: [],
      errors: []
    };

    // Crear una instancia de navegador compartida si se generan imágenes
    let sharedBrowser = null;
    if (CONFIG.generateImages) {
      console.log('🌐 Iniciando navegador compartido...\n');
      sharedBrowser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', // Reduce uso de /dev/shm
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
    }

    try {
      // Función para procesar un devocional individual
    const processDevotional = async (metadata, index, total) => {
      const post = metadata.post;

      try {
        console.log(`[${index + 1}/${total}] Procesando: ${metadata.title}`);

        const outputPath = path.join(CONFIG.outputDir, metadata.htmlFile);
        const audioFilename = `${metadata.dateSlug}.mp3`;
        const audioBaseUrl = CONFIG.audioServerUrl.replace(/\/+$/, '');
        const audioUrl = `${audioBaseUrl}/${audioFilename}`;
        const audioPath = path.join(CONFIG.outputDir, audioFilename);
        const localHashPath = resolveLocalHashPaths(CONFIG.outputDir, metadata.dateSlug);

        let hashState;
        try {
          hashState = await evaluateHashSyncState({
            audioServerUrl: CONFIG.audioServerUrl,
            dateSlug: metadata.dateSlug,
            hashSuffixes: CONFIG.audioHashSuffixes,
            localHashPath
          });
        } catch (hashError) {
          console.warn(`   ⚠️  No se pudo obtener hash remoto: ${hashError.message}`);
          return;
        }

        const plan = buildProcessingPlan({
          hashState,
          generateImagesEnabled: CONFIG.generateImages,
          downloadAudioEnabled: CONFIG.downloadAudio
        });

        if (!plan.shouldProcess) {
          if (plan.reason === 'missing_remote_hash') {
            processingSummary.missingRemoteHash.push(metadata.dateSlug);
            console.log(`   ⏭️  Hash remoto no disponible, se omite actualización completa (${metadata.dateSlug})`);
          } else {
            processingSummary.unchanged.push(metadata.dateSlug);
            console.log(`   ⏭️  Hash sin cambios, se omite actualización completa (${metadata.dateSlug})`);
          }
          return;
        }

        if (plan.reason === 'hash_changed_or_new') {
          processingSummary.changedOrNew.push(metadata.dateSlug);
          console.log(`   🔄 Hash nuevo/diferente detectado, reprocesando todo para ${metadata.dateSlug}`);
        }

        // Determinar devocional anterior y siguiente
        const prevDevotional = index < sortedMetadata.length - 1 ? sortedMetadata[index + 1] : null;
        const nextDevotional = index > 0 ? sortedMetadata[index - 1] : null;

        // Generar HTML con navegación
        const html = parseDevotional(post, template, metadata.dateSlug, prevDevotional, nextDevotional);

        // Guardar HTML solo cuando cambia hash remoto
        if (plan.processHtml) {
          ensureParentDir(outputPath);
          fs.writeFileSync(outputPath, html, 'utf8');
          console.log(`   ✅ HTML actualizado: ${metadata.htmlFile}`);
        }

        // Generar imagen si está habilitado
        if (plan.processImage) {
          const imagePath = path.join(CONFIG.outputDir, `${metadata.dateSlug}.png`);
          ensureParentDir(imagePath);
          console.log(`   🖼️  Generando imagen...`);
          await generateImageFromHtml(outputPath, imagePath, CONFIG.imageWidth, sharedBrowser);
          console.log(`   ✅ Imagen guardada: ${metadata.dateSlug}.png`);
        }

        // Descargar audio si está habilitado
        if (plan.processAudio) {
          ensureParentDir(audioPath);
          console.log(`   🎵 Descargando audio...`);
          const downloaded = await downloadAudioFile(audioUrl, audioPath);
          if (downloaded) {
            console.log(`   ✅ Audio guardado: ${audioFilename}`);
          } else {
            console.log(`   ⚠️  Audio no disponible en servidor`);
          }
        }

        const primaryHashSaved = plan.shouldSaveHash
          ? saveHashIfChanged(localHashPath.primary, hashState.remoteHash)
          : false;
        const legacyHashSaved = plan.shouldSaveHash
          ? saveHashIfChanged(localHashPath.legacy, hashState.remoteHash)
          : false;
        if (primaryHashSaved || legacyHashSaved) {
          const savedNames = [];
          if (primaryHashSaved) savedNames.push(path.basename(localHashPath.primary));
          if (legacyHashSaved) savedNames.push(path.basename(localHashPath.legacy));
          console.log(`   ✅ Hash actualizado: ${savedNames.join(', ')}`);
        }

      } catch (error) {
        processingSummary.errors.push({
          dateSlug: metadata.dateSlug,
          title: post.title && post.title.rendered ? post.title.rendered : metadata.title,
          message: error.message
        });
        console.error(`   ❌ Error procesando "${post.title.rendered}":`, error.message);
      }
    };

    // Procesar en lotes de 2 en paralelo (reducido para evitar OOM)
    const BATCH_SIZE = 2;
    for (let i = 0; i < sortedMetadata.length; i += BATCH_SIZE) {
      const batch = sortedMetadata.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map((metadata, batchIndex) => {
        const globalIndex = i + batchIndex;
        return processDevotional(metadata, globalIndex, sortedMetadata.length);
      });

      await Promise.all(batchPromises);
    }

    // Guardar archivo de metadata JSON ordenado por fecha descendente
    const metadataPath = path.join(CONFIG.outputDir, 'devotionals-metadata.json');
    // Crear copia de metadata sin el objeto post para el JSON
    const metadataForJson = sortedMetadata.map(m => ({
      date: m.date,
      dateSlug: m.dateSlug,
      title: m.title,
      verseRef: m.verseRef,
      verseText: m.verseText,
      htmlFile: m.htmlFile,
      bannerImage: m.bannerImage,
      cssVariant: m.cssVariant
    }));
    const metadataChanged = writeFileIfChanged(metadataPath, JSON.stringify(metadataForJson, null, 2));
    if (metadataChanged) {
      console.log(`\n✅ Metadata actualizada: devotionals-metadata.json`);
    } else {
      console.log(`\n⏭️  Metadata sin cambios: devotionals-metadata.json`);
    }

    // Generar index.html desde el template
    const indexTemplatePath = path.join(__dirname, 'index-template.html');
    if (fs.existsSync(indexTemplatePath)) {
      let indexTemplate = fs.readFileSync(indexTemplatePath, 'utf8');
      const siteBaseUrl = CONFIG.siteBaseUrl.replace(/\/$/, ''); // sin trailing slash
      indexTemplate = indexTemplate.replace(/\{\{SITE_BASE_URL\}\}/g, siteBaseUrl);
      indexTemplate = indexTemplate.replace('{{DEVOTIONALS_JSON}}', JSON.stringify(metadataForJson, null, 2));
      const indexOutputPath = path.join(CONFIG.outputDir, 'index.html');
      const indexChanged = writeFileIfChanged(indexOutputPath, indexTemplate);
      if (indexChanged) {
        console.log(`✅ Index.html actualizado`);
      } else {
        console.log(`⏭️  Index.html sin cambios`);
      }
    }

    const changedSorted = processingSummary.changedOrNew.slice().sort();
    const unchangedSorted = processingSummary.unchanged.slice().sort();
    const missingHashSorted = processingSummary.missingRemoteHash.slice().sort();
    const errorsCount = processingSummary.errors.length;

    console.log('\n📊 Resumen por hash');
    console.log(`   ✅ Nuevos/cambiados: ${changedSorted.length}`);
    if (changedSorted.length > 0) {
      console.log(`      ${changedSorted.join(', ')}`);
    }
    console.log(`   ⏭️  Sin cambios: ${unchangedSorted.length}`);
    if (unchangedSorted.length > 0) {
      console.log(`      ${unchangedSorted.join(', ')}`);
    }
    console.log(`   ⚠️  Sin hash remoto: ${missingHashSorted.length}`);
    if (missingHashSorted.length > 0) {
      console.log(`      ${missingHashSorted.join(', ')}`);
    }
    console.log(`   ❌ Con error: ${errorsCount}`);
    if (errorsCount > 0) {
      const errorDates = processingSummary.errors.map((item) => item.dateSlug).sort();
      console.log(`      ${errorDates.join(', ')}`);
    }

    console.log('\n🎉 ¡Proceso completado!');
    console.log(`📁 Archivos generados en: ${CONFIG.outputDir}`);

    } finally {
      // Cerrar navegador compartido si existe (siempre, incluso si hay error)
      if (sharedBrowser) {
        console.log('\n🌐 Cerrando navegador compartido...');
        try {
          await sharedBrowser.close();
        } catch (err) {
          console.warn('⚠️  Error al cerrar navegador:', err.message);
        }
      }
    }

  } catch (error) {
    console.error('❌ Error fatal:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  normalizeHashValue,
  writeFileIfChanged,
  saveHashIfChanged,
  shouldForceRebuildForHash,
  resolveLocalHashPaths,
  readLocalHash,
  buildProcessingPlan,
  evaluateHashSyncState,
  fetchRemoteAudioHash,
  parseDevotional,
  main
};

/**
 * Parser de JSON a HTML
 * Toma el JSON de WordPress y genera archivos HTML usando el template
 *
 * Variables de entorno:
 * - DEVO_JSON_SOURCE: URL de la API o ruta al archivo JSON (default: https://cenfolic.com/wordpress/wp-json/wp/v2/posts)
 * - DEVO_TEMPLATE_PATH: Ruta al template HTML (default: ./devocional-template_placeholders.html)
 * - DEVO_OUTPUT_DIR: Directorio de salida (default: ./output)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ==========================================
// CONFIGURACIÓN
// ==========================================
const CONFIG = {
  jsonSource: process.env.DEVO_JSON_SOURCE || 'https://cenfolic.com/wordpress/wp-json/wp/v2/posts',
  templatePath: process.env.DEVO_TEMPLATE_PATH || path.join(__dirname, 'devocional-template_placeholders.html'),
  outputDir: process.env.DEVO_OUTPUT_DIR || path.join(__dirname, 'output')
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

      protocol.get(source, (res) => {
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

  // Buscar patrones como "1 Juan 5:11-13 (NTV)"
  const refMatch = content.match(/([1-3]?\s*[A-Za-záéíóúÁÉÍÓÚñÑ]+\s+\d+:\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)*\s*\([A-Z]+\))/);
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
    // Remover la cita bíblica del texto
    verse = verse.replace(/([1-3]?\s*[A-Za-záéíóúÁÉÍÓÚñÑ]+\s+\d+:\d+(?:-\d+)?\s*\([A-Z]+\))/g, '').trim();
    return verse;
  }

  // Buscar en pullquote
  const pullquoteMatch = content.match(/<figure[^>]*class="wp-block-pullquote"[^>]*>(.*?)<\/figure>/is);
  if (pullquoteMatch) {
    let verse = stripHtml(pullquoteMatch[1]);
    verse = verse.replace(/([1-3]?\s*[A-Za-záéíóúÁÉÍÓÚñÑ]+\s+\d+:\d+(?:-\d+)?\s*\([A-Z]+\))/g, '').trim();
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

function parseDevotional(postData, template) {
  const content = postData.content.rendered;

  // Extraer datos
  const data = {
    verse_ref: extractBibleRef(content),
    date: formatDate(postData.date),
    verse_text: extractVerse(content),
    devotional_title: stripHtml(postData.title.rendered),
    biblical_treasure: extractBiblicalTreasure(content),
    call_to_action: extractCallToAction(content)
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

(async function main() {
  try {
    console.log('📖 Iniciando parser de devocionales...\n');
    console.log(`⚙️  Fuente de datos: ${CONFIG.jsonSource}`);
    console.log(`⚙️  Template: ${CONFIG.templatePath}`);
    console.log(`⚙️  Directorio de salida: ${CONFIG.outputDir}\n`);

    // Crear directorio de salida si no existe
    if (!fs.existsSync(CONFIG.outputDir)) {
      fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }

    // Obtener datos (desde URL o archivo local)
    const jsonData = await fetchJsonData(CONFIG.jsonSource);

    // Leer template
    const template = fs.readFileSync(CONFIG.templatePath, 'utf8');

    console.log(`✅ ${jsonData.length} devocionales encontrados\n`);

    // Procesar cada devocional
    jsonData.forEach((post, index) => {
      try {
        console.log(`[${index + 1}/${jsonData.length}] Procesando: ${post.title.rendered}`);

        // Generar HTML
        const html = parseDevotional(post, template);

        // Obtener fecha del URL para el nombre del archivo
        const dateSlug = getDateFromUrl(post.link) || post.slug;
        const filename = `${dateSlug}.html`;
        const outputPath = path.join(CONFIG.outputDir, filename);

        // Guardar archivo
        fs.writeFileSync(outputPath, html, 'utf8');
        console.log(`   ✅ Guardado: ${filename}`);

      } catch (error) {
        console.error(`   ❌ Error procesando "${post.title.rendered}":`, error.message);
      }
    });

    console.log('\n🎉 ¡Proceso completado!');
    console.log(`📁 Archivos generados en: ${CONFIG.outputDir}`);

  } catch (error) {
    console.error('❌ Error fatal:', error.message);
    process.exit(1);
  }
})();

/**
 * Generador de RSS para Podcast de Spotify
 * Genera un archivo RSS XML compatible con Spotify Podcasts
 * Basado en archivos MP3 en https://cenfolic.com/audio/devo/
 */

const fs = require('fs');
const path = require('path');

// ==========================================
// CONFIGURACIÓN DEL PODCAST
// ==========================================
const PODCAST_CONFIG = {
  // Información general
  title: 'Devocionales Diarios - Cenfolic',
  description: 'Reflexiones bíblicas diarias para fortalecer tu fe y caminar con Dios cada día. Meditaciones inspiradoras basadas en la Palabra de Dios.',
  link: 'https://cenfolic.com',
  language: 'es-ES',

  // Categorías de iTunes (Podcasts de Apple)
  categories: [
    { main: 'Religion & Spirituality', sub: 'Christianity' },
    { main: 'Education', sub: 'Self-Improvement' }
  ],

  // Imagen del podcast (1400x1400 a 3000x3000 px, JPG o PNG)
  imageUrl: 'https://cenfolic.com/images/podcast-cover.jpg',

  // Información del autor
  author: 'Cenfolic',
  email: 'podcast@cenfolic.com',
  owner: {
    name: 'Cenfolic',
    email: 'podcast@cenfolic.com'
  },

  // Configuración adicional
  explicit: 'no', // 'yes', 'no', o 'clean'
  copyright: `© ${new Date().getFullYear()} Cenfolic. Todos los derechos reservados.`,

  // URL base de los archivos de audio
  audioBaseUrl: 'https://cenfolic.com/audio/devo/'
};

// ==========================================
// LISTA DE EPISODIOS (MP3 files)
// ==========================================
// Asumiendo que tienes archivos en formato: YYYY-MM-DD.mp3
const episodes = [];

// Función para generar episodios desde una fecha de inicio
function generateEpisodes(startDate, endDate) {
  const episodes = [];
  let currentDate = new Date(startDate);
  const endDateObj = new Date(endDate);

  while (currentDate <= endDateObj) {
    const dateString = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD

    episodes.push({
      title: `Devocional del ${formatSpanishDate(currentDate)}`,
      description: `Reflexión bíblica para el día ${formatSpanishDate(currentDate)}. Únete a nosotros en esta meditación diaria de la Palabra de Dios.`,
      audioFile: `${dateString}.mp3`,
      pubDate: currentDate.toUTCString(),
      duration: '00:05:00', // Duración estimada en formato HH:MM:SS
      episodeNumber: null, // Se calculará automáticamente
      season: currentDate.getFullYear(),
      explicit: 'no'
    });

    // Avanzar un día
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return episodes;
}

// Función auxiliar para formatear fecha en español
function formatSpanishDate(date) {
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  const dia = dias[date.getDay()];
  const numero = date.getDate();
  const mes = meses[date.getMonth()];
  const año = date.getFullYear();

  return `${dia} ${numero} de ${mes} de ${año}`;
}

// Generar episodios desde el 8 de diciembre de 2025 hasta hoy
const episodesList = generateEpisodes('2025-12-08', new Date());

// ==========================================
// FUNCIÓN PARA GENERAR EL RSS XML
// ==========================================
function generatePodcastRSS(config, episodes) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(config.title)}</title>
    <link>${escapeXml(config.link)}</link>
    <language>${config.language}</language>
    <copyright>${escapeXml(config.copyright)}</copyright>
    <description>${escapeXml(config.description)}</description>

    <!-- iTunes/Apple Podcasts Tags -->
    <itunes:author>${escapeXml(config.author)}</itunes:author>
    <itunes:summary>${escapeXml(config.description)}</itunes:summary>
    <itunes:owner>
      <itunes:name>${escapeXml(config.owner.name)}</itunes:name>
      <itunes:email>${config.owner.email}</itunes:email>
    </itunes:owner>
    <itunes:explicit>${config.explicit}</itunes:explicit>
    <itunes:image href="${config.imageUrl}"/>
`;

  // Añadir categorías
  config.categories.forEach(cat => {
    if (cat.sub) {
      xml += `    <itunes:category text="${escapeXml(cat.main)}">
      <itunes:category text="${escapeXml(cat.sub)}"/>
    </itunes:category>
`;
    } else {
      xml += `    <itunes:category text="${escapeXml(cat.main)}"/>
`;
    }
  });

  xml += `    <atom:link href="${config.link}/podcast.xml" rel="self" type="application/rss+xml"/>

`;

  // Añadir episodios
  episodes.forEach((episode, index) => {
    const episodeNumber = episodes.length - index;
    const audioUrl = `${config.audioBaseUrl}${episode.audioFile}`;
    const guid = audioUrl; // GUID único para cada episodio

    xml += `    <item>
      <title>${escapeXml(episode.title)}</title>
      <description>${escapeXml(episode.description)}</description>
      <pubDate>${episode.pubDate}</pubDate>
      <enclosure url="${escapeXml(audioUrl)}" type="audio/mpeg"/>
      <guid isPermaLink="false">${guid}</guid>
      <itunes:duration>${episode.duration}</itunes:duration>
      <itunes:explicit>${episode.explicit}</itunes:explicit>
      <itunes:episode>${episodeNumber}</itunes:episode>
      <itunes:season>${episode.season}</itunes:season>
      <itunes:episodeType>full</itunes:episodeType>
    </item>
`;
  });

  xml += `  </channel>
</rss>`;

  return xml;
}

// Función auxiliar para escapar caracteres especiales XML
function escapeXml(unsafe) {
  if (typeof unsafe !== 'string') return unsafe;
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ==========================================
// GENERAR Y GUARDAR EL ARCHIVO RSS
// ==========================================
const rssXml = generatePodcastRSS(PODCAST_CONFIG, episodesList);
const outputPath = path.join(__dirname, 'podcast.xml');

fs.writeFileSync(outputPath, rssXml, 'utf8');

console.log('✅ RSS generado exitosamente!');
console.log(`📁 Archivo: ${outputPath}`);
console.log(`📊 Total de episodios: ${episodesList.length}`);
console.log('\n📋 PRÓXIMOS PASOS:');
console.log('1. Sube el archivo podcast.xml a tu servidor: https://cenfolic.com/podcast.xml');
console.log('2. Sube la imagen de portada del podcast (1400x1400px mínimo)');
console.log('3. Envía el RSS a Spotify: https://podcasters.spotify.com/');
console.log('4. También puedes enviarlo a Apple Podcasts, Google Podcasts, etc.');
console.log('\n⚠️  IMPORTANTE:');
console.log('   - Asegúrate de que todos los archivos MP3 existan en:', PODCAST_CONFIG.audioBaseUrl);
console.log('   - La URL del RSS debe ser accesible públicamente');
console.log('   - Los archivos de audio deben tener los headers CORS correctos');

// Generar también un archivo de lista de episodios
const episodesListPath = path.join(__dirname, 'episodes-list.json');
fs.writeFileSync(episodesListPath, JSON.stringify(episodesList, null, 2), 'utf8');
console.log(`\n📄 Lista de episodios guardada en: ${episodesListPath}`);

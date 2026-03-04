// ReseñaLibre — Cloudflare Worker
// Resuelve redirects de meli.la y devuelve la URL final + ID de producto

export default {
  async fetch(request) {
    // Allow CORS from anywhere (tu PWA necesita esto)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get('url');

    if (!target) {
      return new Response(JSON.stringify({ error: 'Falta el parámetro ?url=' }), {
        status: 400, headers: corsHeaders
      });
    }

    try {
      // Follow redirects — Cloudflare puede hacer esto sin restricciones CORS
      const resp = await fetch(target, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Android 13; Mobile) AppleWebKit/537.36',
        }
      });

      const finalUrl = resp.url; // URL después de todos los redirects

      // Extraer MLM ID de la URL final
      const mlmId = extractMLMId(finalUrl);

      if (mlmId) {
        return new Response(JSON.stringify({
          ok: true,
          mlm_id: mlmId,
          final_url: finalUrl,
        }), { headers: corsHeaders });
      }

      // Si no encontramos el ID en la URL, intentar leer el HTML
      const html = await resp.text();
      const fromHtml = extractMLMIdFromHtml(html);

      if (fromHtml) {
        return new Response(JSON.stringify({
          ok: true,
          mlm_id: fromHtml,
          final_url: finalUrl,
        }), { headers: corsHeaders });
      }

      return new Response(JSON.stringify({
        ok: false,
        error: 'No se encontró ID de producto en ' + finalUrl,
        final_url: finalUrl,
      }), { status: 404, headers: corsHeaders });

    } catch (e) {
      return new Response(JSON.stringify({
        ok: false,
        error: e.message,
      }), { status: 500, headers: corsHeaders });
    }
  }
};

function extractMLMId(s) {
  if (!s) return null;
  // wid=MLM param
  let m = s.match(/[?&]wid=(MLM\d+)/i);
  if (m) return m[1].toUpperCase();
  // /p/MLM group
  m = s.match(/\/p\/(MLM\d+)/i);
  if (m) return m[1].toUpperCase();
  // MLM digits in URL
  m = s.match(/\/(MLM\d{6,15})/i);
  if (m) return m[1].toUpperCase();
  m = s.match(/MLM[-]?(\d{6,15})/i);
  if (m) return 'MLM' + m[1].replace(/-/g, '');
  return null;
}

function extractMLMIdFromHtml(html) {
  // og:url
  let m = html.match(/og:url[^>]*content="([^"]+)"/i);
  if (m) { const id = extractMLMId(m[1]); if (id) return id; }
  // canonical
  m = html.match(/canonical[^>]*href="([^"]+)"/i);
  if (m) { const id = extractMLMId(m[1]); if (id) return id; }
  // itemId in JSON
  m = html.match(/"itemId"\s*:\s*"(MLM\d+)"/i);
  if (m) return m[1].toUpperCase();
  return null;
}

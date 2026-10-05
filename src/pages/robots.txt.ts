import type { APIRoute } from 'astro';

export const prerender = true;

const DISALLOWED = ['/admin', '/api'];

/**
 * robots.txt dinámico en vez de un archivo estático en `public/`, para que la
 * URL del sitemap salga del mismo `site` que los canonical y no haya que
 * cambiarla a mano en dos sitios.
 */
export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('https://example.invalid');
  const sitemap = new URL('/sitemap.xml', base).href;

  const body = [
    '# Soul and Body — centro de estética en Envigado, Antioquia',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    '# El panel y la API no aportan nada a los buscadores.',
    ...DISALLOWED.map((path) => `Disallow: ${path}`),
    '',
    `# Los buscadores con funciones de IA también pueden leer el sitio; no hay`,
    `# nada que ocultar aquí y conviene que lo lean para las respuestas.`,
    'User-agent: GPTBot',
    'Allow: /',
    'User-agent: ClaudeBot',
    'Allow: /',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    `Sitemap: ${sitemap}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
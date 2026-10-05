import type { APIRoute } from 'astro';

export const prerender = true;

/**
 * Sitemap con las páginas públicas. Las páginas de servicio se añaden cuando
 * exista el catálogo SEO completo (fase de contenido).
 */
export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('https://example.invalid');
  const lastmod = new Date().toISOString().slice(0, 10);

  const pages = ['/', '/legal/privacidad', '/legal/terminos'];

  const urls = pages
    .map((path) => {
      const loc = path === '/' ? base.href : new URL(path, base).href;
      const priority = path === '/' ? '1.0' : '0.3';
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
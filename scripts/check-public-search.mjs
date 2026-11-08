// Read-only check from the machine/network running this script. A successful
// fetch does not prove access from a verified Googlebot IP, or prove indexing.
export async function checkPublicSearch(origin = 'https://boottracker.nl', fetcher = fetch) {
  const paths = ['/', '/amsterdam-routeplanner', '/robots.txt', '/sitemap.xml', '/bruggen-amsterdam', '/bruggen-amsterdam/kortjewantsbrug', '/grachten-amsterdam/prinsengracht']
  return Promise.all(paths.map(async (path) => {
    try {
      const response = await fetcher(new URL(path, origin), { signal: AbortSignal.timeout(15_000), redirect: 'follow', headers: { 'User-Agent': 'BoottrackerPublicSearchCheck/1.0' } })
      const body = await response.text()
      const noindex = /noindex/i.test(response.headers.get('x-robots-tag') || '') || /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(body)
      const valid = path === '/robots.txt' ? body.includes(`Sitemap: https://boottracker.nl/sitemap.xml`)
        : path === '/sitemap.xml' ? body.includes('<urlset') && body.includes('/bruggen-amsterdam/kortjewantsbrug')
        : /<h1[\s>]/i.test(body) && body.includes('rel="canonical"')
      return { path, status: response.status, server: response.headers.get('server'), noindex, contentValid: valid, ok: response.status === 200 && valid && !noindex }
    } catch (error) { return { path, ok: false, error: error.message } }
  }))
}
if (process.argv[1]?.endsWith('/check-public-search.mjs')) {
  const results = await checkPublicSearch(process.argv[2])
  console.table(results)
  if (results.some((result) => !result.ok)) process.exitCode = 1
}

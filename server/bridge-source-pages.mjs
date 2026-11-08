// Both OGC API Features and Amsterdam GeoJSON may return pagination links.
export async function readGeoJsonPages(initialUrl, fetcher=fetch) {
  const features=[];const seen=new Set();let next=initialUrl;let expected=null
  while(next) {
    const url=new URL(next,initialUrl)
    if(url.origin!==new URL(initialUrl).origin||seen.has(url.href)||seen.size>=100)throw Error('Invalid bridge source pagination')
    seen.add(url.href)
    const response=await fetcher(url.href,{headers:{Accept:'application/geo+json, application/json'},signal:AbortSignal.timeout(15_000)})
    if(!response.ok)throw Error(`Bridge source returned ${response.status}`)
    const data=await response.json()
    if(!Array.isArray(data.features))throw Error('Invalid bridge source feature collection')
    const count=Number(data.numberMatched ?? data.totalFeatures)
    if(Number.isFinite(count))expected=count
    features.push(...data.features)
    const link=data.links?.find?.(l=>l.rel==='next')?.href ?? data._links?.next?.href
    next=link?new URL(link,url).href:null
    if(features.length>50_000)throw Error('Bridge source exceeds supported size')
    if(!next&&expected!==null&&features.length<expected)throw Error(`Incomplete bridge source (${features.length}/${expected})`)
    if(!next&&expected===null&&data.features.length>=5000)throw Error('Bridge source may be truncated without pagination')
  }
  return {type:'FeatureCollection',features,numberMatched:expected??features.length}
}

import photos from './boat-photos.json' with { type: 'json' }
export const BOAT_PHOTOS = photos
const noPhoto = () => ({ photoUrl: null, photoVerified: false, photoKind: null, photoSourceUrl: null, photoCaption: '' })
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export function boatPhoto(boat, operatorId, { ambiguousName = false } = {}) {
  // An administrator's uploaded photo always wins over the public catalog.
  if (boat?.photoUrl && boat.photoVerified === true) return { photoUrl: boat.photoUrl, photoKind: boat.photoKind || 'uploaded', photoVerified: true, photoAlt: boat.photoAlt || boat.name, photoSourceUrl: boat.photoSourceUrl || null, photoCaption: boat.photoCaption || '' }
  if (!operatorId) return noPhoto()
  const mmsi = String(boat?.mmsi || '')
  const name = normalize(boat?.name)
  const specific = photos.find((photo) => photo.verified === true && photo.operatorId === operatorId && photo.kind === 'vessel' && (
    photo.mmsis?.length
      ? mmsi ? photo.mmsis.includes(mmsi) : [photo.name, ...(photo.aliases || [])].some((alias) => normalize(alias) === name)
      : !mmsi && !ambiguousName && [photo.name, ...(photo.aliases || [])].some((alias) => normalize(alias) === name)
  ))
  const photo = specific
  if (!photo) return noPhoto()
  return {
    photoUrl: `/boat-photos/${photo.file}?v=${photo.sha256.slice(0, 12)}`,
    photoKind: photo.kind,
    photoVerified: true,
    photoAlt: photo.kind === 'fleet' ? 'Vlootfoto van de rederij; niet de bevestigde foto van deze boot' : `Foto van ${photo.name}`,
    photoCaption: photo.kind === 'fleet' ? 'Vlootfoto — geen bevestigde foto van deze boot' : `Foto van ${photo.name}`,
    photoSourceUrl: photo.sourcePage,
    photoSourceLabel: new URL(photo.sourcePage).hostname.replace(/^www\./, ''),
  }
}

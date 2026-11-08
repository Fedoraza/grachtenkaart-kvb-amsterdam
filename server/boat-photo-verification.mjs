// Only a photo explicitly bound to the current boat identity may be displayed.
export function hasVerifiedBoatPhoto(boat) {
  return Boolean(boat?.photo_verified)
    && String(boat.photo_verified_mmsi || '') === String(boat.mmsi || '')
    && String(boat.photo_verified_name || '') === String(boat.name || '')
}

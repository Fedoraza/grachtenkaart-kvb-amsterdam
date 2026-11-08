const itemFields = [
  'id', 'boat_id', 'boat_name', 'mmsi', 'service_date', 'start_time', 'end_time',
  'person_name', 'role', 'event_type', 'from_location', 'to_location', 'group_location',
  'tour_status', 'scheduled_start_at', 'scheduled_end_at', 'actual_start_at', 'actual_end_at',
  'delay_minutes', 'return_delay_minutes', 'round_duration_minutes', 'tracking_method',
  'route_from', 'route_to', 'ais_point_count',
]
const staffFields = ['id', 'service_date', 'person_name', 'role', 'location', 'start_time', 'end_time']
const pick = (value, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]))

// Public readers receive the visible schedule, without WhatsApp/import metadata
// or free-form internal notes. Authenticated readers retain the existing response.
export function publicPlanningDay(day) {
  return {
    date: day.date,
    locations: day.locations.map(location => ({ name: location.name })),
    items: day.items.map(item => pick(item, itemFields)),
    staff: day.staff.map(member => pick(member, staffFields)),
  }
}

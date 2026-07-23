export const PLANNING_LOCATION_PINS = [
  { name: "Anne Frank", aliases: ["AF", "Anne Frank aanlegsteiger"], latitude: 52.375226, longitude: 4.883823, radiusMeters: 80, label: "Anne Frank (AF)" },
  { name: "Homomonument", aliases: ["HOMO", "Homomonument aanlegsteiger"], latitude: 52.37468, longitude: 4.8854, radiusMeters: 80, label: "Homomonument (HOMO)" },
  { name: "Rijksmuseum", aliases: ["Rijks", "Rijks aanlegsteiger"], latitude: 52.360915, longitude: 4.885641, radiusMeters: 90, label: "Rijksmuseum (Rijks)" },
  { name: "Central Station", aliases: ["Centraal Station", "CS", "CS aanlegsteiger"], latitude: 52.377867, longitude: 4.897888, radiusMeters: 90, label: "Centraal Station (CS)" },
  { name: "Zwanenburgwal", aliases: ["ZWA", "Zwanenburgwal aanlegsteiger"], latitude: 52.3692092, longitude: 4.8998606, label: "Zwanenburgwal (ZWA)" },
  { name: "Sea Palace", aliases: ["SP", "Seapalace", "SeaPalace", "Sea Palace aanlegsteiger"], latitude: 52.376064, longitude: 4.905688, label: "Sea Palace (SP)" },
  { name: "Staverno", aliases: ["Staverno aanlegsteiger", "Staverno steiger"], latitude: 52.3829488, longitude: 4.8594078, label: "Staverno" },
  { name: "E-Harbour", aliases: ["E-Harbor", "EH", "E Harbour", "E Harbor", "E-H aanlegsteiger"], latitude: 52.3353, longitude: 4.917648, label: "E-Harbour (E-H)" },
  { name: "Strandzuid", aliases: ["Strandzuid aanlegsteiger"], latitude: 52.3415982, longitude: 4.8864876, label: "Strandzuid" },
  { name: "Olympisch Stadion", aliases: ["Olympisch Stadion aanlegsteiger"], latitude: 52.3433485, longitude: 4.8525659, label: "Olympisch Stadion" },
];

function normalized(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

export function findPlanningLocationPin(value) {
  const key = normalized(value);
  return PLANNING_LOCATION_PINS.find((pin) => [pin.name, ...pin.aliases].some((name) => normalized(name) === key)) || null;
}

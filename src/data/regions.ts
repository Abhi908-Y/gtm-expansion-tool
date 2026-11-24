// Region presets for new plans. `ai`/`partner` say which public source feeds those two criteria for the region.
export type Preset = { id: string; name: string; ai: 'microsoft' | 'eurostat'; partner: 'eurostat' | 'desk'; countries: string[] };

export const PRESETS: Preset[] = [
  { id: 'sea', name: 'Southeast Asia', ai: 'microsoft', partner: 'desk', countries: ['SGP', 'PHL', 'IDN', 'MYS', 'VNM', 'THA', 'MMR', 'KHM', 'LAO', 'BRN', 'TLS'] },
  { id: 'me', name: 'Middle East', ai: 'microsoft', partner: 'desk', countries: ['ARE', 'SAU', 'QAT', 'KWT', 'BHR', 'OMN', 'JOR', 'LBN', 'IRQ', 'ISR', 'TUR', 'IRN', 'YEM'] },
  { id: 'eu', name: 'Europe', ai: 'eurostat', partner: 'eurostat', countries: ['DEU', 'GBR', 'FRA', 'ITA', 'ESP', 'NLD', 'BEL', 'AUT', 'CHE', 'SWE', 'NOR', 'DNK', 'FIN', 'IRL', 'PRT', 'POL', 'CZE', 'GRC', 'HUN', 'ROU', 'UKR', 'RUS', 'BLR'] },
  { id: 'sa', name: 'South Asia', ai: 'microsoft', partner: 'desk', countries: ['IND', 'PAK', 'BGD', 'LKA', 'NPL'] },
  { id: 'ea', name: 'East Asia', ai: 'microsoft', partner: 'desk', countries: ['CHN', 'JPN', 'KOR', 'HKG', 'MNG'] },
  { id: 'oc', name: 'Oceania', ai: 'microsoft', partner: 'desk', countries: ['AUS', 'NZL'] },
  { id: 'na', name: 'North America', ai: 'microsoft', partner: 'desk', countries: ['USA', 'CAN', 'MEX'] },
  { id: 'la', name: 'Latin America', ai: 'microsoft', partner: 'desk', countries: ['BRA', 'ARG', 'CHL', 'COL', 'PER', 'URY', 'CRI', 'PAN', 'ECU'] },
  { id: 'af', name: 'Africa', ai: 'microsoft', partner: 'desk', countries: ['ZAF', 'NGA', 'KEN', 'EGY', 'MAR', 'GHA', 'TZA', 'ETH', 'RWA', 'SEN', 'CIV'] },
  { id: 'ca', name: 'Central Asia and Caucasus', ai: 'microsoft', partner: 'desk', countries: ['KAZ', 'UZB', 'AZE', 'GEO', 'ARM'] },
];

// Capital-city time zones (multi-zone countries use the capital). Anything missing falls back to a longitude estimate, flagged on screen.
export const TZ: Record<string, string> = {
  SGP: 'Asia/Singapore', PHL: 'Asia/Manila', IDN: 'Asia/Jakarta', MYS: 'Asia/Kuala_Lumpur', VNM: 'Asia/Ho_Chi_Minh', THA: 'Asia/Bangkok', MMR: 'Asia/Yangon', KHM: 'Asia/Phnom_Penh', LAO: 'Asia/Vientiane', BRN: 'Asia/Brunei', TLS: 'Asia/Dili',
  ARE: 'Asia/Dubai', SAU: 'Asia/Riyadh', QAT: 'Asia/Qatar', KWT: 'Asia/Kuwait', BHR: 'Asia/Bahrain', OMN: 'Asia/Muscat', JOR: 'Asia/Amman', LBN: 'Asia/Beirut', IRQ: 'Asia/Baghdad', ISR: 'Asia/Jerusalem', TUR: 'Europe/Istanbul', IRN: 'Asia/Tehran', YEM: 'Asia/Aden',
  DEU: 'Europe/Berlin', GBR: 'Europe/London', FRA: 'Europe/Paris', ITA: 'Europe/Rome', ESP: 'Europe/Madrid', NLD: 'Europe/Amsterdam', BEL: 'Europe/Brussels', AUT: 'Europe/Vienna', CHE: 'Europe/Zurich', SWE: 'Europe/Stockholm', NOR: 'Europe/Oslo', DNK: 'Europe/Copenhagen', FIN: 'Europe/Helsinki', IRL: 'Europe/Dublin', PRT: 'Europe/Lisbon', POL: 'Europe/Warsaw', CZE: 'Europe/Prague', GRC: 'Europe/Athens', HUN: 'Europe/Budapest', ROU: 'Europe/Bucharest', UKR: 'Europe/Kyiv', RUS: 'Europe/Moscow', BLR: 'Europe/Minsk',
  IND: 'Asia/Kolkata', PAK: 'Asia/Karachi', BGD: 'Asia/Dhaka', LKA: 'Asia/Colombo', NPL: 'Asia/Kathmandu',
  CHN: 'Asia/Shanghai', JPN: 'Asia/Tokyo', KOR: 'Asia/Seoul', HKG: 'Asia/Hong_Kong', MNG: 'Asia/Ulaanbaatar',
  AUS: 'Australia/Sydney', NZL: 'Pacific/Auckland', USA: 'America/New_York', CAN: 'America/Toronto', MEX: 'America/Mexico_City',
  BRA: 'America/Sao_Paulo', ARG: 'America/Argentina/Buenos_Aires', CHL: 'America/Santiago', COL: 'America/Bogota', PER: 'America/Lima', URY: 'America/Montevideo', CRI: 'America/Costa_Rica', PAN: 'America/Panama', ECU: 'America/Guayaquil',
  ZAF: 'Africa/Johannesburg', NGA: 'Africa/Lagos', KEN: 'Africa/Nairobi', EGY: 'Africa/Cairo', MAR: 'Africa/Casablanca', GHA: 'Africa/Accra', TZA: 'Africa/Dar_es_Salaam', ETH: 'Africa/Addis_Ababa', RWA: 'Africa/Kigali', SEN: 'Africa/Dakar', CIV: 'Africa/Abidjan',
  KAZ: 'Asia/Almaty', UZB: 'Asia/Tashkent', AZE: 'Asia/Baku', GEO: 'Asia/Tbilisi', ARM: 'Asia/Yerevan',
};

export const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

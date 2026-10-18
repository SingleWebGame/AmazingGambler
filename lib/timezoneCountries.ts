// Browser time zone → ISO country. Far more reliable than the language setting, which often
// reflects the device's default (for example "en-US") rather than where the player lives.
const zones: Record<string, string[]> = {
  AE: ["Asia/Dubai"], AF: ["Asia/Kabul"], AL: ["Europe/Tirane"], AM: ["Asia/Yerevan"], AO: ["Africa/Luanda"],
  AR: ["America/Argentina/Buenos_Aires", "America/Buenos_Aires", "America/Argentina/Cordoba", "America/Argentina/Mendoza"],
  AT: ["Europe/Vienna"], AU: ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth", "Australia/Adelaide", "Australia/Hobart", "Australia/Darwin", "Australia/Canberra"],
  AZ: ["Asia/Baku"], BA: ["Europe/Sarajevo"], BD: ["Asia/Dhaka"], BE: ["Europe/Brussels"], BF: ["Africa/Ouagadougou"],
  BG: ["Europe/Sofia"], BH: ["Asia/Bahrain"], BI: ["Africa/Bujumbura"], BJ: ["Africa/Porto-Novo"], BO: ["America/La_Paz"],
  BR: ["America/Sao_Paulo", "America/Bahia", "America/Fortaleza", "America/Recife", "America/Manaus", "America/Belem", "America/Cuiaba", "America/Campo_Grande"],
  BW: ["Africa/Gaborone"], BY: ["Europe/Minsk"], CA: ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax", "America/St_Johns", "America/Regina", "America/Montreal"],
  CD: ["Africa/Kinshasa", "Africa/Lubumbashi"], CG: ["Africa/Brazzaville"], CH: ["Europe/Zurich"], CI: ["Africa/Abidjan"],
  CL: ["America/Santiago"], CM: ["Africa/Douala"], CN: ["Asia/Shanghai", "Asia/Chongqing", "Asia/Harbin", "Asia/Urumqi"],
  CO: ["America/Bogota"], CR: ["America/Costa_Rica"], CU: ["America/Havana"], CY: ["Asia/Nicosia"], CZ: ["Europe/Prague"],
  DE: ["Europe/Berlin"], DK: ["Europe/Copenhagen"], DO: ["America/Santo_Domingo"], DZ: ["Africa/Algiers"], EC: ["America/Guayaquil"],
  EE: ["Europe/Tallinn"], EG: ["Africa/Cairo"], ES: ["Europe/Madrid", "Atlantic/Canary"], ET: ["Africa/Addis_Ababa"],
  FI: ["Europe/Helsinki"], FR: ["Europe/Paris"], GA: ["Africa/Libreville"], GB: ["Europe/London"], GE: ["Asia/Tbilisi"],
  GH: ["Africa/Accra"], GM: ["Africa/Banjul"], GN: ["Africa/Conakry"], GR: ["Europe/Athens"], GT: ["America/Guatemala"],
  GW: ["Africa/Bissau"], HK: ["Asia/Hong_Kong"], HN: ["America/Tegucigalpa"], HR: ["Europe/Zagreb"], HT: ["America/Port-au-Prince"],
  HU: ["Europe/Budapest"], ID: ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"], IE: ["Europe/Dublin"], IL: ["Asia/Jerusalem", "Asia/Tel_Aviv"],
  IN: ["Asia/Kolkata", "Asia/Calcutta"], IQ: ["Asia/Baghdad"], IR: ["Asia/Tehran"], IS: ["Atlantic/Reykjavik"],
  IT: ["Europe/Rome"], JM: ["America/Jamaica"], JO: ["Asia/Amman"], JP: ["Asia/Tokyo"], KE: ["Africa/Nairobi"],
  KH: ["Asia/Phnom_Penh"], KR: ["Asia/Seoul"], KW: ["Asia/Kuwait"], KZ: ["Asia/Almaty", "Asia/Aqtau"], LB: ["Asia/Beirut"],
  LK: ["Asia/Colombo"], LR: ["Africa/Monrovia"], LT: ["Europe/Vilnius"], LU: ["Europe/Luxembourg"], LV: ["Europe/Riga"],
  LY: ["Africa/Tripoli"], MA: ["Africa/Casablanca"], MD: ["Europe/Chisinau"], MG: ["Indian/Antananarivo"], MK: ["Europe/Skopje"],
  ML: ["Africa/Bamako"], MM: ["Asia/Yangon", "Asia/Rangoon"], MN: ["Asia/Ulaanbaatar"], MR: ["Africa/Nouakchott"], MT: ["Europe/Malta"],
  MU: ["Indian/Mauritius"], MX: ["America/Mexico_City", "America/Cancun", "America/Monterrey", "America/Tijuana", "America/Merida"],
  MY: ["Asia/Kuala_Lumpur"], MZ: ["Africa/Maputo"], NA: ["Africa/Windhoek"], NE: ["Africa/Niamey"], NG: ["Africa/Lagos"],
  NI: ["America/Managua"], NL: ["Europe/Amsterdam"], NO: ["Europe/Oslo"], NP: ["Asia/Kathmandu", "Asia/Katmandu"], NZ: ["Pacific/Auckland"],
  OM: ["Asia/Muscat"], PA: ["America/Panama"], PE: ["America/Lima"], PH: ["Asia/Manila"], PK: ["Asia/Karachi"],
  PL: ["Europe/Warsaw"], PR: ["America/Puerto_Rico"], PT: ["Europe/Lisbon", "Atlantic/Azores", "Atlantic/Madeira"], PY: ["America/Asuncion"],
  QA: ["Asia/Qatar"], RO: ["Europe/Bucharest"], RS: ["Europe/Belgrade"], RU: ["Europe/Moscow", "Asia/Yekaterinburg", "Asia/Novosibirsk", "Asia/Vladivostok", "Europe/Samara", "Asia/Krasnoyarsk", "Asia/Irkutsk"],
  RW: ["Africa/Kigali"], SA: ["Asia/Riyadh"], SD: ["Africa/Khartoum"], SE: ["Europe/Stockholm"], SG: ["Asia/Singapore"],
  SI: ["Europe/Ljubljana"], SK: ["Europe/Bratislava"], SL: ["Africa/Freetown"], SN: ["Africa/Dakar"], SO: ["Africa/Mogadishu"],
  SV: ["America/El_Salvador"], SY: ["Asia/Damascus"], TG: ["Africa/Lome"], TH: ["Asia/Bangkok"], TN: ["Africa/Tunis"],
  TR: ["Europe/Istanbul", "Asia/Istanbul"], TT: ["America/Port_of_Spain"], TW: ["Asia/Taipei"], TZ: ["Africa/Dar_es_Salaam"], UA: ["Europe/Kyiv", "Europe/Kiev"],
  UG: ["Africa/Kampala"], US: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "America/Detroit", "America/Indiana/Indianapolis", "Pacific/Honolulu", "America/Boise"],
  UY: ["America/Montevideo"], UZ: ["Asia/Tashkent"], VE: ["America/Caracas"], VN: ["Asia/Ho_Chi_Minh", "Asia/Saigon"],
  YE: ["Asia/Aden"], ZA: ["Africa/Johannesburg"], ZM: ["Africa/Lusaka"], ZW: ["Africa/Harare"],
};

const zoneToCountry = new Map<string, string>();
for (const [country, names] of Object.entries(zones)) {
  for (const name of names) zoneToCountry.set(name, country);
}

export function countryFromTimeZone(timeZone: string | undefined): string | null {
  return timeZone ? zoneToCountry.get(timeZone) ?? null : null;
}

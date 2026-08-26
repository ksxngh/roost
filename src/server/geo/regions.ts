/**
 * Province and state name → code.
 *
 * Geocoders return a region's full name ("British Columbia"); the rest of the
 * app stores the two-letter code ("BC"), which is what service areas are keyed
 * on. This maps one to the other so a geocoded address can be compared to a
 * business's service areas. Codes pass through unchanged, so a value that is
 * already "BC" stays "BC".
 */
const REGION_CODES: Record<string, string> = {
  // Canada — provinces and territories.
  alberta: "AB",
  "british columbia": "BC",
  manitoba: "MB",
  "new brunswick": "NB",
  "newfoundland and labrador": "NL",
  newfoundland: "NL",
  "nova scotia": "NS",
  ontario: "ON",
  "prince edward island": "PE",
  quebec: "QC",
  québec: "QC",
  saskatchewan: "SK",
  "northwest territories": "NT",
  nunavut: "NU",
  yukon: "YT",
  // United States.
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

/**
 * A two-letter region code for a province/state name, or the input upper-cased
 * and trimmed when it is already a code (or unrecognised). Never throws — an
 * unknown region simply passes through so it can still be compared literally.
 */
export function normalizeRegion(region: string): string {
  const trimmed = region.trim();
  const code = REGION_CODES[trimmed.toLowerCase()];
  if (code) return code;
  return trimmed.toUpperCase();
}

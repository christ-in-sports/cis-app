export interface RegistrationInput {
  first_name: string;
  last_name: string;
  email: string | null;
  gender: string | null;
  dob: string | null;            // ISO yyyy-mm-dd
  grade: string | null;
  address: string | null;
  youth_phone: string | null;
  youth_email: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_email: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  session: 'juniors' | 'ambassadors' | null;
}

/** Strip everything but letters+digits so header variants collapse together. */
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Exact matches, checked first. Keys are normalized forms of your
 * Google Form headers, in the order you listed them.
 */
const EXACT_MAP: Record<string, keyof RegistrationInput | '__ignore__'> = {
  timestamp: '__ignore__',
  emailaddress: 'email',
  ciserfirstname: 'first_name',
  ciserlastname: 'last_name',
  pictureorselfieofciser: '__ignore__',
  parentguardian: 'guardian_name',
  parentguardianphonenumber: 'guardian_phone',
  parentguardianemail: 'guardian_email',
  youthphonenumber: 'youth_phone',
  youthemail: 'youth_email',
  youthtshirtsize: '__ignore__',
  gender: 'gender',
  dob: 'dob',
  grade: 'grade',
  homeaddress: 'address',
  emergencycontactname: 'emergency_contact_name',
  emergencycontactnumber: 'emergency_contact_phone',
  '7thgradeonlypleasechoosewhichsessionyoudliketoattend': 'session'
};

/** Fallback fuzzy rules, in priority order. More specific first. */
const FUZZY_RULES: [RegExp, keyof RegistrationInput][] = [
  [/session/, 'session'],
  [/emergency.*(name)/, 'emergency_contact_name'],
  [/emergency.*(number|phone|cell)/, 'emergency_contact_phone'],
  [/(parent|guardian).*(email)/, 'guardian_email'],
  [/(parent|guardian).*(phone|number|cell)/, 'guardian_phone'],
  [/(parent|guardian)/, 'guardian_name'],
  [/youth.*(email)/, 'youth_email'],
  [/youth.*(phone|number|cell)/, 'youth_phone'],
  [/(first).*(name)/, 'first_name'],
  [/(last|sur).*(name)/, 'last_name'],
  [/(dob|dateofbirth|birthdate|birthday)/, 'dob'],
  [/(homeaddress|address|street)/, 'address'],
  [/grade/, 'grade'],
  [/gender/, 'gender'],
  [/email/, 'email'],
];

export interface HeaderMapping {
  mapped: Record<number, keyof RegistrationInput>;
  ignored: string[];
  unrecognized: string[];
}

export function mapHeaders(headers: string[]): HeaderMapping {
  const mapped: Record<number, keyof RegistrationInput> = {};
  const ignored: string[] = [];
  const unrecognized: string[] = [];
  const claimed = new Set<string>();

  headers.forEach((raw, i) => {
    const key = normalizeHeader(raw);
    if (!key) return;

    const exact = EXACT_MAP[key];
    if (exact === '__ignore__') {
      ignored.push(raw);
      return;
    }
    if (exact && !claimed.has(exact)) {
      mapped[i] = exact;
      claimed.add(exact);
      return;
    }

    const rule = FUZZY_RULES.find(([re]) => re.test(key));
    if (rule && !claimed.has(rule[1])) {
      mapped[i] = rule[1];
      claimed.add(rule[1]);
      return;
    }

    if (exact || rule) ignored.push(raw);
    else unrecognized.push(raw);
  });

  return { mapped, ignored, unrecognized };
}

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s === '-' || s.toLowerCase() === 'n/a' ? null : s;
};

/** Keep digits; format 10-digit US numbers for readability. */
export function normalizePhone(v: unknown): string | null {
  const s = clean(v);
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    const d = digits.slice(1);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return s;
}

/**
 * Google Forms dates are usually M/D/YYYY. Also handles ISO and dashes.
 * Two-digit years: 00-09 -> 2000s, else 1900s (a "10" birth year is far more
 * likely 2010 for a kid, so we bias recent).
 */
export function parseDob(v: unknown): string | null {
  const s = clean(v);
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const us = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (us) {
    let [, mm, dd, yy] = us;
    let year = parseInt(yy, 10);
    if (yy.length === 2) year = year <= 25 ? 2000 + year : 1900 + year;
    const m = parseInt(mm, 10);
    const d = parseInt(dd, 10);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

export interface ParsedRow {
  rowNumber: number;
  data: RegistrationInput | null;
  errors: string[];
}

/** Reads the 7th-grade choice; falls back to grade for everyone else. */
export function parseSession(
  choice: string | null,
  grade: string | null
): 'juniors' | 'ambassadors' | null {
  const c = (choice ?? '').toLowerCase();
  if (c.includes('ambassador')) return 'ambassadors';
  if (c.includes('junior')) return 'juniors';
  return defaultSession(grade);
}

/** 4-6 juniors, 8-12 ambassadors, 7 undecided. */
export function defaultSession(g: string | null): 'juniors' | 'ambassadors' | null {
  const t = (g ?? '').trim().toLowerCase();
  if (!t) return null;
  if (['k', 'tk', 'kinder', 'kindergarten'].includes(t)) return null;
  const d = t.replace(/\D/g, '');
  if (d === '') return null;
  const n = parseInt(d, 10);
  if (n >= 4 && n <= 6) return 'juniors';
  if (n >= 8 && n <= 12) return 'ambassadors';
  return null;
}

export function parseRows(
  rows: string[][],
  mapping: HeaderMapping
): ParsedRow[] {
  return rows.map((cells, idx) => {
    const rowNumber = idx + 2; // +1 header, +1 for 1-based
    const errors: string[] = [];

    const get = (field: keyof RegistrationInput): string | null => {
      const entry = Object.entries(mapping.mapped).find(([, f]) => f === field);
      if (!entry) return null;
      return clean(cells[Number(entry[0])]);
    };

    const first_name = get('first_name');
    const last_name = get('last_name');

    if (!first_name) errors.push('Missing first name');
    if (!last_name) errors.push('Missing last name');

    const rawDob = get('dob');
    const dob = parseDob(rawDob);
    if (rawDob && !dob) errors.push(`Unreadable date of birth: "${rawDob}"`);

    if (errors.length > 0 || !first_name || !last_name) {
      return { rowNumber, data: null, errors };
    }

    return {
      rowNumber,
      errors,
      data: {
        first_name,
        last_name,
        email: get('email'),
        gender: get('gender'),
        dob,
        grade: get('grade'),
        address: get('address'),
        youth_phone: normalizePhone(get('youth_phone')),
        youth_email: get('youth_email'),
        guardian_name: get('guardian_name'),
        guardian_phone: normalizePhone(get('guardian_phone')),
        guardian_email: get('guardian_email'),
        emergency_contact_name: get('emergency_contact_name'),
        emergency_contact_phone: normalizePhone(get('emergency_contact_phone')),
        session: parseSession(get('session'), get('grade')),
      },
    };
  });
}

export const identityKey = (r: { first_name: string; last_name: string; dob: string | null }) =>
  `${r.first_name.trim().toLowerCase()}|${r.last_name.trim().toLowerCase()}|${r.dob ?? ''}`;
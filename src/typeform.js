/**
 * Parse Typeform webhook payload into a flat key-value map and metadata.
 * Typeform sends: event_type, form_response: { answers[], definition?, hidden?, submitted_at }
 * Each answer has: type, field: { id, ref }, and value in type-specific key (text, email, url, choice, etc.)
 */
function getAnswerValue(answer) {
  if (!answer) return '';
  if (answer.text !== undefined) return answer.text;
  if (answer.email !== undefined) return answer.email;
  if (answer.url !== undefined) return answer.url;
  if (answer.phone_number !== undefined) return answer.phone_number;
  if (answer.number !== undefined) return String(answer.number);
  if (answer.boolean !== undefined) return answer.boolean ? 'Yes' : 'No';
  if (answer.date !== undefined) return answer.date;
  if (answer.file_url !== undefined) return answer.file_url;
  if (answer.payment !== undefined) return answer.payment?.amount ?? '';
  if (answer.choice !== undefined) {
    const c = answer.choice;
    return typeof c === 'object' && c !== null && 'label' in c ? c.label : String(c);
  }
  if (answer.choices !== undefined) {
    const labels = (answer.choices.labels || []).join(', ');
    return labels || (answer.choices.other || '');
  }
  return '';
}

function normalizeKey(key) {
  if (!key || typeof key !== 'string') return '';
  return key
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Build a map of field ref/id -> value from form_response.answers and optional definition.
 * Also merge in form_response.hidden for UTM/attribution.
 */
function parsePayload(body) {
  const eventType = body?.event_type;
  const formResponse = body?.form_response;
  if (eventType !== 'form_response' || !formResponse) {
    return null;
  }

  const submittedAt = formResponse.submitted_at || new Date().toISOString();
  const d = new Date(submittedAt);
  const dateStr = [
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    d.getFullYear(),
  ].join('/'); // MM/DD/YYYY

  const map = {};
  const answers = formResponse.answers || [];
  const definition = formResponse.definition || {};
  const fieldsDef = definition.fields || [];

  for (const answer of answers) {
    const field = answer.field || {};
    const ref = field.ref ? normalizeKey(field.ref) : '';
    const id = field.id || '';
    const value = getAnswerValue(answer);
    if (ref) map[ref] = value;
    if (id) map[id] = value;
    // Also store by title if we have definition
    const fieldDef = fieldsDef.find((f) => f.id === id);
    if (fieldDef?.title) {
      map[normalizeKey(fieldDef.title)] = value;
    }
  }

  // Hidden fields (e.g. UTM)
  const hidden = formResponse.hidden || {};
  for (const [k, v] of Object.entries(hidden)) {
    map[normalizeKey(k)] = v;
  }

  return {
    submittedAt,
    dateStr,
    map,
    raw: formResponse,
  };
}

/**
 * Map Typeform keys (refs/titles) to our display keys. We try several possible refs per display key.
 */
const DISPLAY_KEY_ALIASES = {
  time: ['time', 'timestamp', 'date'],
  name: ['name', 'full_name', 'your_name', 'first_name', 'name_1'],
  email: ['email', 'email_address'],
  phone: ['phone', 'phone_number', 'tel', 'mobile'],
  work_situation: ['work_situation', 'work_situation_1', 'current_work', 'employment'],
  monthly_income: ['monthly_income', 'income', 'income_range', 'monthly_income_1'],
  has_budget: ['has_budget', 'budget', 'has_budget_2_3k', 'tools_marketing_budget'],
  package_selection: ['package_selection', 'package', 'selected_package', 'package_choice'],
  source: ['source', 'lead_source', 'where_did_you_hear', 'how_did_you_hear'],
  why_land_flipping: ['why_land_flipping', 'why_land_flip', 'why_interest', 'reason'],
  calendar_link: ['calendar_link', 'calendar_url', 'calendly', 'booking_link', 'meeting_link'],
  // Qualification: Yes/No to cost of program (Yes = qualified, can book a call)
  program_cost_ok: ['program_cost_ok', 'cost_of_program', 'cost_ok', 'program_cost', 'ok_with_cost', 'yes_no_cost', 'agree_to_cost'],
  // Attribution (often in hidden)
  utm_source: ['utm_source', 'source', 'src'],
  utm_medium: ['utm_medium', 'medium', 'med'],
  utm_campaign: ['utm_campaign', 'campaign', 'camp'],
  utm_term: ['utm_term', 'term'],
  utm_content: ['utm_content', 'content'],
};

function getFirstMatch(map, aliases) {
  for (const a of aliases) {
    const v = map[a];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

/**
 * Build lead object for Discord embed. Uses N/A for missing fields.
 */
function buildLeadFromParsed(parsed) {
  const { map, dateStr } = parsed;
  const get = (displayKey) => getFirstMatch(map, DISPLAY_KEY_ALIASES[displayKey] || [displayKey]);

  const name = get('name') || 'N/A';
  const email = get('email') || 'N/A';
  const phone = get('phone') || 'N/A';
  const workSituation = get('work_situation') || 'N/A';
  const monthlyIncome = get('monthly_income') || 'N/A';
  const hasBudget = get('has_budget') || 'N/A';
  const packageSelection = get('package_selection') || 'N/A';
  const source = get('source') || 'N/A';
  const whyLandFlipping = get('why_land_flipping') || 'N/A';
  let calendarLink = get('calendar_link');
  if (!calendarLink && map) {
    for (const v of Object.values(map)) {
      if (typeof v === 'string' && v.includes('calendly.com')) {
        calendarLink = v.trim();
        break;
      }
    }
  }

  // Attribution
  const utmSource = get('utm_source') || 'N/A';
  const utmMedium = get('utm_medium') || 'N/A';
  const utmCampaign = get('utm_campaign') || 'N/A';
  const utmTerm = get('utm_term') || 'N/A';
  const utmContent = get('utm_content') || 'N/A';

  // Qualified = said Yes to cost of program (able to book a call), else No = unqualified
  const programCostAnswer = (get('program_cost_ok') || '').toLowerCase().trim();
  const saidYesToCost = ['yes', 'y', 'true', '1', 'i agree', 'agree'].includes(programCostAnswer);
  const hasCalendar = calendarLink && calendarLink.trim() !== '';
  const qualified = saidYesToCost || hasCalendar;

  return {
    dateStr,
    name,
    email,
    phone,
    workSituation,
    monthlyIncome,
    hasBudget,
    packageSelection,
    source,
    whyLandFlipping,
    programCostAnswer: get('program_cost_ok') || 'N/A',
    calendarLink: calendarLink || null,
    attribution: { utmSource, utmMedium, utmCampaign, utmTerm, utmContent },
    qualified,
  };
}

module.exports = { parsePayload, buildLeadFromParsed };

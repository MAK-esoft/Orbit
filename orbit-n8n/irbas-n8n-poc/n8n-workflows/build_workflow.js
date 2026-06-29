// ============================================================
// Builds irbas_whatsapp_flow.json for n8n import.
// Run:  node n8n-workflows/build_workflow.js
//
// We generate the workflow programmatically so the embedded
// Code-node JavaScript stays readable (no manual JSON escaping).
// ============================================================
const fs = require('fs');
const path = require('path');

let X = 0;
const COL = 280;            // horizontal spacing between nodes
const Y_MAIN = 300;         // main spine row
const Y_A = 120;            // payment branch row
const Y_B = 460;            // expense branch row
const Y_C = 640;            // unrecognised branch row

function pos(col, y) { return [260 + col * COL, y]; }

// ---- Orbit API integration header set ----------------------
// All ingestion now goes through the Orbit API (single source of truth),
// authenticated with the shared X-Integration-Key. Supabase is retired.
function orbitHeaders(extra = []) {
  return {
    parameters: [
      { name: 'X-Integration-Key', value: '={{ $env.INTEGRATION_API_KEY }}' },
      { name: 'Content-Type', value: 'application/json' },
      ...extra,
    ],
  };
}
// Orbit API base, including the global /api prefix (e.g. http://localhost:4000/api).
const ORBIT_BASE = '={{ $env.ORBIT_API_BASE_URL }}';

const nodes = [];
const connections = {};

function connect(from, to, fromOutput = 0) {
  if (!connections[from]) connections[from] = { main: [] };
  while (connections[from].main.length <= fromOutput) connections[from].main.push([]);
  connections[from].main[fromOutput].push({ node: to, type: 'main', index: 0 });
}

// ============================================================
// Node 1a: WhatsApp Incoming (POST webhook)
// ============================================================
nodes.push({
  parameters: {
    httpMethod: 'POST',
    path: 'whatsapp-incoming',
    responseMode: 'onReceived',
    options: {},
  },
  id: 'webhook-post',
  name: 'WhatsApp Incoming',
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: pos(0, Y_MAIN),
  webhookId: 'whatsapp-incoming',
});

// ============================================================
// Node 1b: WhatsApp Verify (GET webhook challenge) -> Respond
// ============================================================
nodes.push({
  parameters: {
    httpMethod: 'GET',
    path: 'whatsapp-incoming',
    responseMode: 'responseNode',
    options: {},
  },
  id: 'webhook-get',
  name: 'WhatsApp Verify',
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: pos(0, Y_C),
  webhookId: 'whatsapp-incoming',
});
nodes.push({
  parameters: {
    respondWith: 'text',
    responseBody: "={{ $json.query['hub.challenge'] }}",
    options: {},
  },
  id: 'verify-respond',
  name: 'Verify Challenge',
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  position: pos(1, Y_C),
});
connect('WhatsApp Verify', 'Verify Challenge');

// ============================================================
// Node 2: Extract Fields (Code) — normalize mock + real shapes
// ============================================================
nodes.push({
  parameters: {
    jsCode: `// Unified normalizer for BOTH triggers:
//  - WhatsApp Cloud API webhook (and the mock scripts)
//  - Slack (n8n Slack Trigger / Slack Events API)
// Both triggers connect into this node; downstream stays unchanged.
const incoming = $input.first().json;

// Unwrap the webhook wrapper (.body) and the mock double-wrap (.body.body).
const reqBody = (incoming && incoming.body) ? incoming.body : incoming;
const root = (reqBody && reqBody.body) ? reqBody.body : reqBody;

// --- detect source shape ---
const isWhatsApp = !!(root && root.entry);
const slackEvent = (root && root.event) ? root.event
                 : ((root && (root.type === 'message' || root.channel) && root.text !== undefined) ? root : null);
const isSlack = !isWhatsApp && !!slackEvent;

let sender_phone = '';
let group_id = '';
let message_text = '';
let media_id = '';
let media_url = '';   // downloadable URL (Slack url_private) — drives the image-proof path
let media_mime = '';

if (isSlack) {
  // Slack: channel stands in for the WhatsApp group; user id for the sender.
  message_text = slackEvent.text || '';
  group_id = slackEvent.channel || '';
  sender_phone = slackEvent.user || slackEvent.bot_id || '';
  const file = (slackEvent.files && slackEvent.files[0]) ? slackEvent.files[0] : null;
  if (file) {
    media_id = file.id || '';
    media_mime = file.mimetype || '';
    // Only treat IMAGES as proof to read (skip pdfs/other in this phase).
    if (media_mime.indexOf('image/') === 0) {
      media_url = file.url_private_download || file.url_private || '';
    }
  }
} else {
  // WhatsApp: enforce ?token only when the inbound webhook supplied a query string.
  const expected = $env.WHATSAPP_VERIFY_TOKEN;
  const provided = (incoming && incoming.query) ? incoming.query.token : undefined;
  if (expected && String(expected).length > 0 && incoming && incoming.query && provided !== expected) {
    throw new Error('Unauthorized: invalid or missing ?token query parameter');
  }
  const entry  = root && root.entry ? root.entry[0] : undefined;
  const change = entry && entry.changes ? entry.changes[0] : undefined;
  const value  = change ? change.value : undefined;
  const msg    = value && value.messages ? value.messages[0] : undefined;
  message_text = (msg && msg.text && msg.text.body) ? msg.text.body : '';
  group_id = value && value.metadata ? value.metadata.display_phone_number : '';
  sender_phone = msg && msg.from ? msg.from : '';
  media_id = (msg && msg.image && msg.image.id) ? msg.image.id
           : (msg && msg.document && msg.document.id) ? msg.document.id : '';
}

return [{
  json: {
    source: isSlack ? 'slack' : 'whatsapp',
    sender_phone,
    group_id,
    message_text,
    media_id,
    media_url,
    media_mime,
    raw_payload_obj: reqBody || {},
  },
}];`,
  },
  id: 'extract-fields',
  name: 'Extract Fields',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos(1, Y_MAIN),
});
connect('WhatsApp Incoming', 'Extract Fields');

// ============================================================
// Node 1c: Slack Incoming (Slack Trigger) -> Extract Fields
// Second trigger. Feeds the same pipeline. Requires a Slack API
// credential named "IRBAS Slack" and (for real Slack) a public
// webhook URL via a tunnel — see README "Slack trigger".
// ============================================================
nodes.push({
  parameters: {
    trigger: ['message'],
    watchWorkspace: true,
    options: {},
  },
  id: 'slack-trigger',
  name: 'Slack Incoming',
  type: 'n8n-nodes-base.slackTrigger',
  typeVersion: 1,
  position: pos(0, Y_B),
  webhookId: 'slack-incoming',
  credentials: { slackApi: { id: 'irbas-slack-cred', name: 'IRBAS Slack' } },
  // Disabled on import so the workflow activates without Slack creds (WhatsApp keeps working).
  // Enable this node once the IRBAS Slack credential + ngrok tunnel are set up.
  disabled: true,
});
connect('Slack Incoming', 'Extract Fields');

// ============================================================
// Node 3: Log Raw Message (HTTP POST -> Supabase)
// ============================================================
nodes.push({
  parameters: {
    method: 'POST',
    url: ORBIT_BASE + '/integrations/messages',
    sendHeaders: true,
    headerParameters: orbitHeaders(),
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: `={{ JSON.stringify({
  source: ($node['Extract Fields'].json.source === 'slack') ? 'SLACK' : 'WHATSAPP',
  senderRef: $node['Extract Fields'].json.sender_phone,
  channelId: $node['Extract Fields'].json.group_id,
  messageText: $node['Extract Fields'].json.message_text,
  mediaUrl: $node['Extract Fields'].json.media_url || null,
  mediaMime: $node['Extract Fields'].json.media_mime || null,
  rawPayload: $node['Extract Fields'].json.raw_payload_obj
}) }}`,
    options: {},
  },
  id: 'log-raw',
  name: 'Log Raw Message',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: pos(2, Y_MAIN),
});
connect('Extract Fields', 'Log Raw Message');

// ============================================================
// Node 3b: Capture Message Id (Code) — handle array|object resp
// ============================================================
nodes.push({
  parameters: {
    jsCode: `// Orbit wraps responses in { data, meta, error }. Unwrap to the row.
const r = $input.first().json;
const body = (r && r.data !== undefined) ? r.data : r;
const row = Array.isArray(body) ? body[0] : body;
return [{ json: { workflow_message_id: row && row.id ? row.id : null } }];`,
  },
  id: 'capture-id',
  name: 'Capture Message Id',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos(3, Y_MAIN),
});
connect('Log Raw Message', 'Capture Message Id');

// ============================================================
// Node 4a: Build Groq Body (Code)
// ============================================================
nodes.push({
  parameters: {
    jsCode: `const text = $node['Extract Fields'].json.message_text || '';
const hasImage = ($node['Extract Fields'].json.media_id || '') !== '';

const system = "You are a classifier for messages sent by Pakistani Regional Office accountants in a WhatsApp business group. You must respond with ONLY valid JSON — no explanation, no markdown, no backticks. Just the raw JSON object.";

const user = [
  'Classify the following message into exactly one category and extract key fields.',
  '',
  'Message: "' + text + '"',
  'Has image attached: ' + hasImage,
  '',
  'Respond with ONLY this JSON structure:',
  '{',
  '  "classification": "payment_proof" | "expense_proof" | "unrecognised",',
  '  "amount_pkr": <number or null>,',
  '  "payment_method": "bank_transfer" | "cash_deposit" | "unknown" | null,',
  '  "deposit_slip_ref": "<string or null>",',
  '  "description": "<one line summary in English>"',
  '}',
  '',
  'Classification rules:',
  '- payment_proof: message mentions payment, transfer, deposit, amount sent to IRBAS account',
  '- expense_proof: message mentions expense, repair, purchase, bill, petrol, utility paid by the RO',
  '- unrecognised: anything else (greetings, announcements, questions)',
  '',
  'Amount extraction rules:',
  '- Pakistani formats: 450,000 or 4.5 lac or 4.5 lakh or 450000 are all valid numbers',
  '- Extract deposit slip or reference numbers if mentioned (e.g. slip number 2024-1847)',
  '- If no amount visible, return null'
].join('\\n');

return [{ json: {
  model: 'llama-3.1-8b-instant',
  temperature: 0,
  max_tokens: 300,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
} }];`,
  },
  id: 'build-groq',
  name: 'Build Groq Body',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos(4, Y_MAIN),
});
// ============================================================
// Node 3c: Has Image Proof? (IF) — image -> vision path, else text path
// ============================================================
nodes.push({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [
        {
          id: 'has-media',
          leftValue: "={{ $node['Extract Fields'].json.media_url }}",
          rightValue: '',
          operator: { type: 'string', operation: 'notEmpty', singleValue: true },
        },
      ],
      combinator: 'and',
    },
    options: {},
  },
  id: 'has-image',
  name: 'Has Image Proof',
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: pos(4, Y_MAIN),
});
connect('Capture Message Id', 'Has Image Proof');
connect('Has Image Proof', 'Build Groq Body', 1); // false (no image) -> text path

// ============================================================
// Image path: Download Slack File -> Build Vision Body -> Groq Vision
// ============================================================
nodes.push({
  parameters: {
    method: 'GET',
    url: "={{ $node['Extract Fields'].json.media_url }}",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'Authorization', value: '=Bearer ' + '{{ $env.SLACK_BOT_TOKEN }}' },
      ],
    },
    options: { response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
  },
  id: 'download-file',
  name: 'Download Image',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: pos(5, Y_A - 60),
});
connect('Has Image Proof', 'Download Image', 0); // true (has image)

nodes.push({
  parameters: {
    jsCode: `// Base64-encode the downloaded image and build a Groq vision request.
// Use the binary-data helper so it works whether n8n stored the bytes in
// memory or on the filesystem (binary.data.data is a pointer in fs mode).
const item = $input.first();
let mime = $node['Extract Fields'].json.media_mime || 'image/jpeg';
let b64 = '';
if (item.binary && item.binary.data) {
  if (item.binary.data.mimeType) mime = item.binary.data.mimeType;
  const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
  b64 = buf.toString('base64');
}
if (!mime || mime.indexOf('image/') !== 0) mime = 'image/jpeg';
const caption = $node['Extract Fields'].json.message_text || '';

const system = "You are a classifier for payment/expense PROOF images sent by Pakistani Regional Office accountants. Respond with ONLY valid JSON — no explanation, no markdown, no backticks. Just the raw JSON object.";

const user = [
  'This image is a financial document sent by an accountant — usually a bank deposit slip, a bank transfer/payment screenshot, a cheque, or a purchase/transaction receipt.',
  caption ? ('Caption sent with the image: "' + caption + '"') : 'No caption was sent with the image.',
  '',
  'Read ALL text in the image, then extract the fields and classify. ALWAYS extract whatever is visible — do not return nulls if the value is present in the image. Respond with ONLY this JSON structure:',
  '{',
  '  "classification": "payment_proof" | "expense_proof" | "unrecognised",',
  '  "amount_pkr": <number or null>,',
  '  "payment_method": "bank_transfer" | "cash_deposit" | "card" | "unknown" | null,',
  '  "deposit_slip_ref": "<transaction id / reference / slip number, or null>",',
  '  "description": "<one line: merchant or purpose + key details>"',
  '}',
  '',
  'Classification (be generous — extract first, classify second):',
  '- payment_proof: a deposit, bank transfer, or payment showing money sent or received.',
  '- expense_proof: a purchase, card transaction, bill, or any receipt for money spent.',
  '- unrecognised: ONLY when the image contains no financial transaction at all (e.g. a photo, a meme, plain text with no amounts).',
  '',
  'Amount: use the MAIN total. If a PKR / Rs amount is shown, use that; otherwise use the largest amount on the receipt. Strip commas and currency symbols: "Rs. 1,317.55" -> 1317.55, "450,000" -> 450000.',
  'deposit_slip_ref: capture any Transaction ID / reference / slip / cheque number printed on it (e.g. "027400").',
  'description: include the merchant/purpose and a couple of identifying details (card last 4, date) when present.'
].join('\\n');

return [{ json: {
  model: 'gpt-4o',
  temperature: 0,
  max_tokens: 400,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: [
      { type: 'text', text: user },
      { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + b64 } }
    ] }
  ]
} }];`,
  },
  id: 'build-vision',
  name: 'Build Vision Body',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos(6, Y_A - 60),
});
connect('Download Image', 'Build Vision Body');

nodes.push({
  parameters: {
    method: 'POST',
    url: 'https://api.openai.com/v1/chat/completions',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'Authorization', value: '=Bearer ' + '{{ $env.OPENAI_API_KEY }}' },
        { name: 'Content-Type', value: 'application/json' },
      ],
    },
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json) }}',
    options: {},
  },
  id: 'openai-vision',
  name: 'OpenAI Vision',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: pos(7, Y_A - 60),
});
connect('Build Vision Body', 'OpenAI Vision');
connect('OpenAI Vision', 'Parse Classification'); // converges with the text path

// ============================================================
// Node 4: Groq Classification (HTTP POST)
// ============================================================
nodes.push({
  parameters: {
    method: 'POST',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'Authorization', value: '=Bearer ' + '{{ $env.GROQ_API_KEY }}' },
        { name: 'Content-Type', value: 'application/json' },
      ],
    },
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json) }}',
    options: {},
  },
  id: 'groq',
  name: 'Groq Classification',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: pos(5, Y_MAIN),
});
connect('Build Groq Body', 'Groq Classification');

// ============================================================
// Node 4b: Parse Classification (Code) — strip backticks, default
// ============================================================
nodes.push({
  parameters: {
    jsCode: `const resp = $input.first().json;
let content = '';
try { content = resp && resp.choices && resp.choices[0] && resp.choices[0].message ? resp.choices[0].message.content : ''; }
catch (e) { content = ''; }

let parsed;
try {
  const cleaned = String(content).replace(/\`\`\`json|\`\`\`/g, '').trim();
  parsed = JSON.parse(cleaned);
} catch (e) {
  console.log('Groq classification parse FAILED, defaulting to unrecognised. Raw content:', content);
  parsed = { classification: 'unrecognised', amount_pkr: null, payment_method: null, deposit_slip_ref: null, description: 'Could not parse AI response' };
}

const allowed = ['payment_proof', 'expense_proof', 'unrecognised'];
if (!allowed.includes(parsed.classification)) parsed.classification = 'unrecognised';

let amt = parsed.amount_pkr;
if (amt === undefined) amt = null;
if (typeof amt === 'string') { const n = parseFloat(amt.replace(/,/g, '')); amt = isNaN(n) ? null : n; }

console.log('Classification:', parsed.classification, '| amount:', amt, '| slip:', parsed.deposit_slip_ref);

return [{ json: {
  classification: parsed.classification,
  amount_pkr: amt,
  payment_method: parsed.payment_method != null ? parsed.payment_method : null,
  deposit_slip_ref: parsed.deposit_slip_ref != null ? parsed.deposit_slip_ref : null,
  description: parsed.description != null ? parsed.description : ''
} }];`,
  },
  id: 'parse-classification',
  name: 'Parse Classification',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos(6, Y_MAIN),
});
connect('Groq Classification', 'Parse Classification');

// ============================================================
// Node 5: Route by Classification (Switch v3, rules mode)
// ============================================================
function rule(value, key) {
  return {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [
        {
          id: 'cond-' + key,
          leftValue: '={{ $json.classification }}',
          rightValue: value,
          operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' },
        },
      ],
      combinator: 'and',
    },
    renameOutput: true,
    outputKey: key,
  };
}
nodes.push({
  parameters: {
    rules: {
      values: [
        rule('payment_proof', 'payment_proof'),
        rule('expense_proof', 'expense_proof'),
        rule('unrecognised', 'unrecognised'),
      ],
    },
    options: {},
  },
  id: 'switch',
  name: 'Route by Classification',
  type: 'n8n-nodes-base.switch',
  typeVersion: 3,
  position: pos(7, Y_MAIN),
});
connect('Parse Classification', 'Route by Classification');

// ============================================================
// BRANCH A — Payment Proof (Switch output 0)
// ============================================================
nodes.push({
  parameters: {
    operation: 'getAll',
    returnAll: false,
    limit: 20,
    simple: true,
    filters: {
      q: "={{ 'from:' + $env.IRBAS_BANK_EMAIL + ' after:' + new Date(Date.now() - 86400000).toISOString().split('T')[0].replace(/-/g,'/') }}",
    },
    options: {},
  },
  id: 'gmail-search',
  name: 'Search Bank Emails',
  type: 'n8n-nodes-base.gmail',
  typeVersion: 2.1,
  position: pos(8, Y_A),
  credentials: { gmailOAuth2: { id: 'irbas-gmail-cred', name: 'IRBAS Gmail' } },
  onError: 'continueRegularOutput',
});
connect('Route by Classification', 'Search Bank Emails', 0);

nodes.push({
  parameters: {
    jsCode: `const claimedAmount = $node['Parse Classification'].json.amount_pkr;
const claimedSlip = $node['Parse Classification'].json.deposit_slip_ref;
const emails = $input.all().map(i => i.json);
console.log('Matching against', emails.length, 'candidate email item(s). claimedAmount=', claimedAmount, 'claimedSlip=', claimedSlip);

function extractAmount(text) {
  if (!text) return null;
  const patterns = [
    /Amount:?\\s*PKR\\s*([0-9,]+)/i,   // UBL style
    /PKR\\s*([0-9,]+)/i,               // HBL style
    /Rs\\.?\\s*([0-9,]+)/i,            // MCB style
    /([0-9]{3,},[0-9]{3})/             // Generic 450,000
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) { const n = parseFloat(m[1].replace(/,/g, '')); if (!isNaN(n)) return n; }
  }
  return null;
}
function extractSlip(text) {
  if (!text) return null;
  const m = text.match(/(?:slip|ref(?:erence)?|trx|txn)[^0-9]{0,10}([0-9][0-9\\-]{3,})/i);
  return m ? m[1] : null;
}

let result = { matched: false, bank_amount: null, bank_timestamp: null, match_confidence: 'low' };

for (const e of emails) {
  const text = e.text || e.snippet || e.textHtml || e.textPlain || '';
  if (!text) { continue; } // skip passthrough/non-email items
  const amt = extractAmount(text);
  const slip = extractSlip(text);
  const ts = e.date || e.internalDate || null;
  console.log('  candidate -> amount:', amt, 'slip:', slip);

  const slipMatch = claimedSlip && slip && String(slip) === String(claimedSlip);
  const amtMatch = (claimedAmount != null) && (amt != null) && Math.abs(amt - Number(claimedAmount)) <= 500;

  if (slipMatch || amtMatch) {
    let iso = null;
    if (ts) { const d = new Date(isNaN(ts) ? ts : Number(ts)); if (!isNaN(d.getTime())) iso = d.toISOString(); }
    result = {
      matched: true,
      bank_amount: amt,
      bank_timestamp: iso,
      match_confidence: (slipMatch && amtMatch) ? 'high' : (slipMatch ? 'high' : 'low')
    };
    break;
  }
}
console.log('Bank match result:', JSON.stringify(result));
return [{ json: result }];`,
  },
  id: 'match-email',
  name: 'Match Email to Payment',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos(9, Y_A),
});
connect('Search Bank Emails', 'Match Email to Payment');

// RO resolution + message linking + ledger now happen inside the Orbit API.
// We just build the ingestion payload and POST it.
nodes.push({
  parameters: {
    jsCode: `const m = $node['Match Email to Payment'].json;
const c = $node['Parse Classification'].json;
const ef = $node['Extract Fields'].json;
const amount = (c.amount_pkr != null) ? String(c.amount_pkr) : undefined;
return [{ json: {
  source: (ef.source === 'slack') ? 'SLACK' : 'WHATSAPP',
  channelId: ef.group_id,
  senderRef: ef.sender_phone || undefined,
  messageText: ef.message_text || undefined,
  workflowMessageId: $node['Capture Message Id'].json.workflow_message_id || undefined,
  amount,
  referenceNumber: c.deposit_slip_ref || undefined,
  extraction: {
    classification: 'payment_proof',
    extractedAmount: amount,
    extractedPaymentMethod: c.payment_method || undefined,
    slipRef: c.deposit_slip_ref || undefined,
    description: c.description || undefined,
    bankEmailMatch: !!m.matched,
    bankEmailAmount: (m.bank_amount != null) ? String(m.bank_amount) : undefined,
    bankEmailTimestamp: m.bank_timestamp || undefined,
    model: ef.media_url ? 'gpt-4o' : 'llama-3.1-8b-instant',
    rawResponse: c
  }
} }];`,
  },
  id: 'build-payment-body',
  name: 'Build Payment Body',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos(10, Y_A),
});
connect('Match Email to Payment', 'Build Payment Body');

nodes.push({
  parameters: {
    method: 'POST',
    url: ORBIT_BASE + '/integrations/submissions',
    sendHeaders: true,
    headerParameters: orbitHeaders(),
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json) }}',
    options: {},
  },
  id: 'create-payment',
  name: 'Create Payment Request',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: pos(11, Y_A),
});
connect('Build Payment Body', 'Create Payment Request');

// ============================================================
// BRANCH B — Expense Proof (Switch output 1)
// ============================================================
nodes.push({
  parameters: {
    jsCode: `const c = $node['Parse Classification'].json;
const ef = $node['Extract Fields'].json;
const amount = (c.amount_pkr != null) ? String(c.amount_pkr) : undefined;
return [{ json: {
  source: (ef.source === 'slack') ? 'SLACK' : 'WHATSAPP',
  channelId: ef.group_id,
  senderRef: ef.sender_phone || undefined,
  messageText: ef.message_text || undefined,
  workflowMessageId: $node['Capture Message Id'].json.workflow_message_id || undefined,
  amount,
  extraction: {
    classification: 'expense_proof',
    extractedAmount: amount,
    extractedPaymentMethod: c.payment_method || undefined,
    slipRef: c.deposit_slip_ref || undefined,
    description: c.description || undefined,
    model: ef.media_url ? 'gpt-4o' : 'llama-3.1-8b-instant',
    rawResponse: c
  }
} }];`,
  },
  id: 'build-expense-body',
  name: 'Build Expense Body',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos(8, Y_B),
});
connect('Route by Classification', 'Build Expense Body', 1);

nodes.push({
  parameters: {
    method: 'POST',
    url: ORBIT_BASE + '/integrations/submissions',
    sendHeaders: true,
    headerParameters: orbitHeaders(),
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json) }}',
    options: {},
  },
  id: 'create-expense',
  name: 'Create Expense Request',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: pos(9, Y_B),
});
connect('Build Expense Body', 'Create Expense Request');

// ============================================================
// BRANCH C — Unrecognised (Switch output 2)
// ============================================================
nodes.push({
  parameters: {
    method: 'PATCH',
    url: ORBIT_BASE + "/integrations/messages/{{ $node['Capture Message Id'].json.workflow_message_id }}",
    sendHeaders: true,
    headerParameters: orbitHeaders(),
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ classification: 'unrecognised', processingStatus: 'processed' }) }}",
    options: {},
  },
  id: 'mark-unknown',
  name: 'Mark Unrecognised',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: pos(8, Y_C),
});
connect('Route by Classification', 'Mark Unrecognised', 2);

// ============================================================
// APP-ORIGINATED ENRICHMENT BRANCH
// Orbit POSTs { submissionId, source:'app', roId, fileUrl, messageText } here.
// We extract (vision if a file, else Groq text) and post the result back to
// POST {ORBIT}/integrations/submissions/:submissionId/extraction.
// ============================================================
const Y_APP1 = 880;   // app spine
const Y_APP2 = 1040;  // app vision sub-row

nodes.push({
  parameters: {
    httpMethod: 'POST',
    path: 'app-submission',
    responseMode: 'onReceived',
    options: {},
  },
  id: 'app-webhook',
  name: 'App Submission',
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: pos(0, Y_APP1),
  webhookId: 'app-submission',
});

nodes.push({
  parameters: {
    jsCode: `const incoming = $input.first().json;
const b = (incoming && incoming.body) ? incoming.body : incoming;
const fileUrl = b.fileUrl || '';
return [{ json: {
  submissionId: b.submissionId || '',
  fileUrl,
  messageText: b.messageText || '',
  hasFile: fileUrl !== ''
} }];`,
  },
  id: 'app-extract',
  name: 'App Extract',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos(1, Y_APP1),
});
connect('App Submission', 'App Extract');

nodes.push({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [
        {
          id: 'app-has-file',
          leftValue: "={{ $node['App Extract'].json.fileUrl }}",
          rightValue: '',
          operator: { type: 'string', operation: 'notEmpty', singleValue: true },
        },
      ],
      combinator: 'and',
    },
    options: {},
  },
  id: 'app-has-file',
  name: 'App Has File',
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: pos(2, Y_APP1),
});
connect('App Extract', 'App Has File');

// ---- App vision path (file present) ------------------------
nodes.push({
  parameters: {
    method: 'GET',
    url: "={{ $node['App Extract'].json.fileUrl }}",
    sendHeaders: true,
    headerParameters: orbitHeaders(),
    options: { response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
  },
  id: 'app-download',
  name: 'App Download Image',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: pos(3, Y_APP2),
});
connect('App Has File', 'App Download Image', 0);

nodes.push({
  parameters: {
    jsCode: `const item = $input.first();
let mime = 'image/jpeg';
let b64 = '';
if (item.binary && item.binary.data) {
  if (item.binary.data.mimeType) mime = item.binary.data.mimeType;
  const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
  b64 = buf.toString('base64');
}
if (!mime || mime.indexOf('image/') !== 0) mime = 'image/jpeg';
const caption = $node['App Extract'].json.messageText || '';
const system = "You are a classifier for payment/expense PROOF images. Respond with ONLY valid JSON — no markdown, no backticks.";
const user = [
  'This image is a financial document (deposit slip, transfer/payment screenshot, cheque, or receipt).',
  caption ? ('Caption: "' + caption + '"') : 'No caption.',
  'Read ALL text, then extract and classify. Respond ONLY with this JSON:',
  '{ "classification": "payment_proof" | "expense_proof" | "unrecognised", "amount_pkr": <number or null>, "payment_method": "bank_transfer" | "cash_deposit" | "card" | "unknown" | null, "deposit_slip_ref": "<string or null>", "description": "<one line>" }'
].join('\\n');
return [{ json: {
  model: 'gpt-4o', temperature: 0, max_tokens: 400,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: [
      { type: 'text', text: user },
      { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + b64 } }
    ] }
  ]
} }];`,
  },
  id: 'app-build-vision',
  name: 'App Build Vision Body',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos(4, Y_APP2),
});
connect('App Download Image', 'App Build Vision Body');

nodes.push({
  parameters: {
    method: 'POST',
    url: 'https://api.openai.com/v1/chat/completions',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'Authorization', value: '=Bearer ' + '{{ $env.OPENAI_API_KEY }}' },
        { name: 'Content-Type', value: 'application/json' },
      ],
    },
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json) }}',
    options: {},
  },
  id: 'app-openai',
  name: 'App OpenAI Vision',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: pos(5, Y_APP2),
});
connect('App Build Vision Body', 'App OpenAI Vision');
connect('App OpenAI Vision', 'App Parse Extraction');

// ---- App text path (no file) -------------------------------
nodes.push({
  parameters: {
    jsCode: `const text = $node['App Extract'].json.messageText || '';
const system = "You classify messages from Pakistani RO accountants. Respond with ONLY valid JSON — no markdown, no backticks.";
const user = [
  'Classify the message and extract fields.',
  'Message: "' + text + '"',
  'Respond ONLY with: { "classification": "payment_proof" | "expense_proof" | "unrecognised", "amount_pkr": <number or null>, "payment_method": "bank_transfer" | "cash_deposit" | "unknown" | null, "deposit_slip_ref": "<string or null>", "description": "<one line>" }'
].join('\\n');
return [{ json: {
  model: 'llama-3.1-8b-instant', temperature: 0, max_tokens: 300,
  messages: [ { role: 'system', content: system }, { role: 'user', content: user } ]
} }];`,
  },
  id: 'app-build-groq',
  name: 'App Build Groq Body',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos(3, Y_APP1),
});
connect('App Has File', 'App Build Groq Body', 1);

nodes.push({
  parameters: {
    method: 'POST',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'Authorization', value: '=Bearer ' + '{{ $env.GROQ_API_KEY }}' },
        { name: 'Content-Type', value: 'application/json' },
      ],
    },
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json) }}',
    options: {},
  },
  id: 'app-groq',
  name: 'App Groq Classification',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: pos(4, Y_APP1),
});
connect('App Build Groq Body', 'App Groq Classification');
connect('App Groq Classification', 'App Parse Extraction');

// ---- Parse + post back -------------------------------------
nodes.push({
  parameters: {
    jsCode: `const resp = $input.first().json;
let content = '';
try { content = resp.choices[0].message.content; } catch (e) { content = ''; }
let parsed;
try { parsed = JSON.parse(String(content).replace(/\`\`\`json|\`\`\`/g, '').trim()); }
catch (e) { parsed = { classification: 'unrecognised', amount_pkr: null, payment_method: null, deposit_slip_ref: null, description: 'Could not parse AI response' }; }
const allowed = ['payment_proof', 'expense_proof', 'unrecognised'];
if (!allowed.includes(parsed.classification)) parsed.classification = 'unrecognised';
let amt = parsed.amount_pkr;
if (typeof amt === 'string') { const n = parseFloat(amt.replace(/,/g, '')); amt = isNaN(n) ? null : n; }
const hasFile = $node['App Extract'].json.hasFile;
return [{ json: {
  extraction: {
    classification: parsed.classification,
    extractedAmount: (amt != null) ? String(amt) : undefined,
    extractedPaymentMethod: parsed.payment_method || undefined,
    slipRef: parsed.deposit_slip_ref || undefined,
    description: parsed.description || undefined,
    model: hasFile ? 'gpt-4o' : 'llama-3.1-8b-instant',
    rawResponse: parsed
  }
} }];`,
  },
  id: 'app-parse',
  name: 'App Parse Extraction',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos(6, Y_APP1),
});

nodes.push({
  parameters: {
    method: 'POST',
    url: ORBIT_BASE + "/integrations/submissions/{{ $node['App Extract'].json.submissionId }}/extraction",
    sendHeaders: true,
    headerParameters: orbitHeaders(),
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json) }}',
    options: {},
  },
  id: 'app-post-extraction',
  name: 'App Post Extraction',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: pos(7, Y_APP1),
});
connect('App Parse Extraction', 'App Post Extraction');

// ============================================================
// Assemble + write
// ============================================================
const workflow = {
  name: 'Orbit Workflow Integration',
  nodes,
  connections,
  active: false,
  settings: { executionOrder: 'v1' },
  pinData: {},
  meta: { templateCredsSetupCompleted: false },
  tags: [],
};

const out = path.join(__dirname, 'irbas_whatsapp_flow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2));
console.log('Wrote', out, 'with', nodes.length, 'nodes.');

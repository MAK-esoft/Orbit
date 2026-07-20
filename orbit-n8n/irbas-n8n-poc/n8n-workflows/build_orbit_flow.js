// ============================================================
// Builds irbas_orbit_flow.json — a SIMPLIFIED Orbit workflow.
// Run:  node n8n-workflows/build_orbit_flow.js
//
// Two entry points, no external-credential nodes:
//   1. WhatsApp inbound  (POST/GET /webhook/whatsapp-incoming)
//   2. App-originated     (POST /webhook/app-submission)
//
// Dropped vs. the original irbas_whatsapp_flow.json (they required Gmail/Slack
// credentials that don't exist on a fresh n8n and blocked activation):
//   - Slack trigger
//   - "Is WhatsApp?" + Slack "Download Image" (only WhatsApp sends media now)
//   - "Search Bank Emails" (Gmail) + "Match Email to Payment"
// Bank-email matching is simply reported as false.
// ============================================================
const fs = require('fs');
const path = require('path');

const COL = 280;
const Y_MAIN = 300;
const Y_A = 120;
const Y_B = 460;
const Y_C = 640;
function pos(col, y) { return [260 + col * COL, y]; }

function orbitHeaders(extra = []) {
  return {
    parameters: [
      { name: 'X-Integration-Key', value: '={{ $env.INTEGRATION_API_KEY }}' },
      { name: 'Content-Type', value: 'application/json' },
      ...extra,
    ],
  };
}
const ORBIT_BASE = '={{ $env.ORBIT_API_BASE_URL }}';

const nodes = [];
const connections = {};
function connect(from, to, fromOutput = 0) {
  if (!connections[from]) connections[from] = { main: [] };
  while (connections[from].main.length <= fromOutput) connections[from].main.push([]);
  connections[from].main[fromOutput].push({ node: to, type: 'main', index: 0 });
}

// ============================================================
// Trigger 1a: WhatsApp Incoming (POST webhook)
// ============================================================
nodes.push({
  parameters: { httpMethod: 'POST', path: 'whatsapp-incoming', responseMode: 'onReceived', options: {} },
  id: 'webhook-post',
  name: 'WhatsApp Incoming',
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: pos(0, Y_MAIN),
  webhookId: 'whatsapp-incoming',
});

// Trigger 1b: WhatsApp Verify (GET webhook challenge) -> Respond
nodes.push({
  parameters: { httpMethod: 'GET', path: 'whatsapp-incoming', responseMode: 'responseNode', options: {} },
  id: 'webhook-get',
  name: 'WhatsApp Verify',
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: pos(0, Y_C),
  webhookId: 'whatsapp-incoming',
});
nodes.push({
  parameters: { respondWith: 'text', responseBody: "={{ $json.query['hub.challenge'] }}", options: {} },
  id: 'verify-respond',
  name: 'Verify Challenge',
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  position: pos(1, Y_C),
});
connect('WhatsApp Verify', 'Verify Challenge');

// ============================================================
// Extract Fields (Code) — normalize the WhatsApp Cloud API shape
// ============================================================
nodes.push({
  parameters: {
    jsCode: `// Normalizer for the WhatsApp Cloud API webhook (and the mock scripts).
const incoming = $input.first().json;
const reqBody = (incoming && incoming.body) ? incoming.body : incoming;
const root = (reqBody && reqBody.body) ? reqBody.body : reqBody;

let sender_phone = '';
let group_id = '';
let message_text = '';
let media_id = '';
let media_url = '';
let media_mime = '';

// Only validate ?token when one is actually supplied. Meta's real POST callbacks
// carry no query params, so an absent token must NOT be rejected (the mock
// scripts still send ?token= and are validated against it).
const expected = $env.WHATSAPP_VERIFY_TOKEN;
const provided = (incoming && incoming.query) ? incoming.query.token : undefined;
if (expected && provided !== undefined && provided !== expected) {
  throw new Error('Unauthorized: invalid ?token query parameter');
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
// Media messages carry no text.body — use the caption as the message text —
// and expose the mime type so the vision path can build the data URL.
if (msg && msg.image) {
  media_mime = msg.image.mime_type || '';
  if (!message_text && msg.image.caption) message_text = msg.image.caption;
} else if (msg && msg.document) {
  media_mime = msg.document.mime_type || '';
  if (!message_text && msg.document.caption) message_text = msg.document.caption;
}

return [{
  json: {
    source: 'whatsapp',
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
// Log Raw Message -> Orbit
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
  source: 'WHATSAPP',
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

// Capture Message Id
nodes.push({
  parameters: {
    jsCode: `const r = $input.first().json;
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
// Has Image Proof? (IF) — image -> vision path, else text path
// ============================================================
nodes.push({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [
        {
          id: 'has-media',
          leftValue: "={{ $node['Extract Fields'].json.media_url || $node['Extract Fields'].json.media_id }}",
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

// ============================================================
// Image path (WhatsApp media): Resolve media id -> download -> vision
// ============================================================
nodes.push({
  parameters: {
    method: 'GET',
    url: "=https://graph.facebook.com/v21.0/{{ $node['Extract Fields'].json.media_id }}",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'Authorization', value: '=Bearer ' + '{{ $env.WHATSAPP_API_TOKEN }}' },
      ],
    },
    options: {},
  },
  id: 'resolve-wa-media',
  name: 'Resolve WA Media',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: pos(5, Y_A - 60),
});
connect('Has Image Proof', 'Resolve WA Media', 0); // true (has image)

nodes.push({
  parameters: {
    method: 'GET',
    url: "={{ $node['Resolve WA Media'].json.url }}",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'Authorization', value: '=Bearer ' + '{{ $env.WHATSAPP_API_TOKEN }}' },
      ],
    },
    options: { response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
  },
  id: 'download-wa-media',
  name: 'Download WA Media',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: pos(6, Y_A - 60),
});
connect('Resolve WA Media', 'Download WA Media');

// Encode the downloaded image to base64 in JSON. Emitting it as JSON (not
// binary) means any downstream node can read it back by name — Build Payment/
// Expense Body reference $('Encode Image') to attach it to the Orbit ingest,
// since binary does not survive the OpenAI HTTP call.
nodes.push({
  parameters: {
    jsCode: `const item = $input.first();
let mime = $node['Extract Fields'].json.media_mime || 'image/jpeg';
let b64 = '';
if (item.binary && item.binary.data) {
  if (item.binary.data.mimeType) mime = item.binary.data.mimeType;
  const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
  b64 = buf.toString('base64');
}
if (!mime || mime.indexOf('image/') !== 0) mime = 'image/jpeg';
const ext = mime.indexOf('png') !== -1 ? 'png' : (mime.indexOf('webp') !== -1 ? 'webp' : 'jpg');
return [{ json: { imageB64: b64, imageMime: mime, imageName: 'whatsapp-proof.' + ext } }];`,
  },
  id: 'encode-image',
  name: 'Encode Image',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos(6, Y_A + 60),
});
connect('Download WA Media', 'Encode Image');

nodes.push({
  parameters: {
    jsCode: `// Build the OpenAI vision request from the base64 produced by Encode Image.
const mime = $json.imageMime || 'image/jpeg';
const b64 = $json.imageB64 || '';
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
  '  "description": "<one line: merchant or purpose + key details>",',
  '  "fields": [ { "label": "<Title Case label>", "value": "<text as printed>" } ]',
  '}',
  '',
  'For "fields": include EVERY distinct piece of information actually visible on the document as a {label, value} pair — e.g. Amount, Account Title, Account Number, IBAN, Bank, Branch, Beneficiary Name, Sender Name, Date, Time, Transaction ID, Reference, Channel, Status, Card. ONLY include a field whose value is present; OMIT anything not shown. Never invent values.',
  '',
  'Classification (be generous — extract first, classify second):',
  '- payment_proof: a deposit, bank transfer, or payment showing money sent or received.',
  '- expense_proof: a purchase, card transaction, bill, or any receipt for money spent.',
  '- unrecognised: ONLY when the image contains no financial transaction at all.',
  '',
  'Amount: use the MAIN total. Strip commas and currency symbols: "Rs. 1,317.55" -> 1317.55, "450,000" -> 450000.'
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
  position: pos(7, Y_A - 60),
});
connect('Encode Image', 'Build Vision Body');

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
  position: pos(8, Y_A - 60),
});
connect('Build Vision Body', 'OpenAI Vision');
connect('OpenAI Vision', 'Parse Classification');

// ============================================================
// Text path: Build Groq Body -> Groq -> Parse
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
  '  "description": "<one line summary in English>",',
  '  "fields": [ { "label": "<Title Case>", "value": "<text>" } ]',
  '}',
  '',
  'For "fields": include each concrete detail actually present in the message as a {label, value} pair (Amount, Bank, Reference, Beneficiary, Date, etc.). OMIT anything not stated; never invent.',
  '',
  'Classification rules:',
  '- payment_proof: message mentions payment, transfer, deposit, amount sent to IRBAS account',
  '- expense_proof: message mentions expense, repair, purchase, bill, petrol, utility paid by the RO',
  '- unrecognised: anything else (greetings, announcements, questions)',
  '',
  'Amount extraction rules:',
  '- Pakistani formats: 450,000 or 4.5 lac or 4.5 lakh or 450000 are all valid numbers',
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
  position: pos(5, Y_MAIN),
});
connect('Has Image Proof', 'Build Groq Body', 1); // false (no image) -> text path

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
  position: pos(6, Y_MAIN),
});
connect('Build Groq Body', 'Groq Classification');

// Parse Classification (shared by both paths)
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
  parsed = { classification: 'unrecognised', amount_pkr: null, payment_method: null, deposit_slip_ref: null, description: 'Could not parse AI response' };
}

const allowed = ['payment_proof', 'expense_proof', 'unrecognised'];
if (!allowed.includes(parsed.classification)) parsed.classification = 'unrecognised';

let amt = parsed.amount_pkr;
if (amt === undefined) amt = null;
if (typeof amt === 'string') { const n = parseFloat(amt.replace(/,/g, '')); amt = isNaN(n) ? null : n; }

const fields = Array.isArray(parsed.fields)
  ? parsed.fields
      .filter(f => f && f.label != null && f.value != null && String(f.value).trim() !== '')
      .map(f => ({ label: String(f.label), value: String(f.value) }))
  : [];

return [{ json: {
  classification: parsed.classification,
  amount_pkr: amt,
  payment_method: parsed.payment_method != null ? parsed.payment_method : null,
  deposit_slip_ref: parsed.deposit_slip_ref != null ? parsed.deposit_slip_ref : null,
  description: parsed.description != null ? parsed.description : '',
  fields
} }];`,
  },
  id: 'parse-classification',
  name: 'Parse Classification',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos(7, Y_MAIN),
});
connect('Groq Classification', 'Parse Classification');

// ============================================================
// Route by Classification (Switch v3)
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
    rules: { values: [rule('payment_proof', 'payment_proof'), rule('expense_proof', 'expense_proof'), rule('unrecognised', 'unrecognised')] },
    options: {},
  },
  id: 'switch',
  name: 'Route by Classification',
  type: 'n8n-nodes-base.switch',
  typeVersion: 3,
  position: pos(8, Y_MAIN),
});
connect('Parse Classification', 'Route by Classification');

// BRANCH A — Payment Proof (no Gmail bank-email matching)
nodes.push({
  parameters: {
    jsCode: `const c = $node['Parse Classification'].json;
const ef = $node['Extract Fields'].json;
const amount = (c.amount_pkr != null) ? String(c.amount_pkr) : undefined;
// Attach the proof image if the vision path ran (Encode Image only executes
// on the image branch; referencing it on the text path throws — guard it).
let img = {};
try {
  const e = $('Encode Image').first().json;
  if (e && e.imageB64) img = { imageBase64: e.imageB64, imageMime: e.imageMime, imageName: e.imageName };
} catch (err) {}
return [{ json: {
  source: 'WHATSAPP',
  channelId: ef.group_id,
  senderRef: ef.sender_phone || undefined,
  messageText: ef.message_text || undefined,
  workflowMessageId: $node['Capture Message Id'].json.workflow_message_id || undefined,
  amount,
  referenceNumber: c.deposit_slip_ref || undefined,
  ...img,
  extraction: {
    classification: 'payment_proof',
    extractedAmount: amount,
    extractedPaymentMethod: c.payment_method || undefined,
    slipRef: c.deposit_slip_ref || undefined,
    description: c.description || undefined,
    fields: Array.isArray(c.fields) ? c.fields : [],
    bankEmailMatch: false,
    model: (ef.media_url || ef.media_id) ? 'gpt-4o' : 'llama-3.1-8b-instant',
    rawResponse: c
  }
} }];`,
  },
  id: 'build-payment-body',
  name: 'Build Payment Body',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos(9, Y_A),
});
connect('Route by Classification', 'Build Payment Body', 0);

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
  position: pos(10, Y_A),
});
connect('Build Payment Body', 'Create Payment Request');

// BRANCH B — Expense Proof
nodes.push({
  parameters: {
    jsCode: `const c = $node['Parse Classification'].json;
const ef = $node['Extract Fields'].json;
const amount = (c.amount_pkr != null) ? String(c.amount_pkr) : undefined;
let img = {};
try {
  const e = $('Encode Image').first().json;
  if (e && e.imageB64) img = { imageBase64: e.imageB64, imageMime: e.imageMime, imageName: e.imageName };
} catch (err) {}
return [{ json: {
  source: 'WHATSAPP',
  channelId: ef.group_id,
  senderRef: ef.sender_phone || undefined,
  messageText: ef.message_text || undefined,
  workflowMessageId: $node['Capture Message Id'].json.workflow_message_id || undefined,
  amount,
  ...img,
  extraction: {
    classification: 'expense_proof',
    extractedAmount: amount,
    extractedPaymentMethod: c.payment_method || undefined,
    slipRef: c.deposit_slip_ref || undefined,
    description: c.description || undefined,
    fields: Array.isArray(c.fields) ? c.fields : [],
    model: (ef.media_url || ef.media_id) ? 'gpt-4o' : 'llama-3.1-8b-instant',
    rawResponse: c
  }
} }];`,
  },
  id: 'build-expense-body',
  name: 'Build Expense Body',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos(9, Y_B),
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
  position: pos(10, Y_B),
});
connect('Build Expense Body', 'Create Expense Request');

// BRANCH C — Unrecognised
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
  position: pos(9, Y_C),
});
connect('Route by Classification', 'Mark Unrecognised', 2);

// ============================================================
// Trigger 2: App-originated enrichment
// ============================================================
const Y_APP1 = 880;
const Y_APP2 = 1040;

nodes.push({
  parameters: { httpMethod: 'POST', path: 'app-submission', responseMode: 'onReceived', options: {} },
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

// App vision path (file present)
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
  'Read ALL text on it. Respond ONLY with this JSON (no markdown):',
  '{',
  '  "classification": "payment_proof" | "expense_proof" | "unrecognised",',
  '  "amount_pkr": <number or null>,',
  '  "payment_method": "bank_transfer" | "cash_deposit" | "card" | "unknown" | null,',
  '  "deposit_slip_ref": "<string or null>",',
  '  "fields": [ { "label": "<Title Case label>", "value": "<text as printed>" } ]',
  '}',
  'For "fields": include EVERY distinct piece of information actually visible on the document, each as a {label, value} pair — e.g. Amount, Account Title, Account Number, IBAN, Bank, Branch, Beneficiary Name, Sender Name, Date, Time, Transaction ID, Reference, Channel, Status, Card. ONLY include a field whose value is actually present; OMIT anything not shown. Never invent or guess values.'
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

// App text path (no file)
nodes.push({
  parameters: {
    jsCode: `const text = $node['App Extract'].json.messageText || '';
const system = "You classify messages from Pakistani RO accountants. Respond with ONLY valid JSON — no markdown, no backticks.";
const user = [
  'Classify the message and extract fields.',
  'Message: "' + text + '"',
  'Respond ONLY with this JSON:',
  '{ "classification": "payment_proof" | "expense_proof" | "unrecognised", "amount_pkr": <number or null>, "payment_method": "bank_transfer" | "cash_deposit" | "unknown" | null, "deposit_slip_ref": "<string or null>", "fields": [ { "label": "<Title Case>", "value": "<text>" } ] }',
  'For "fields": include each concrete detail actually present in the message as a {label, value} pair (e.g. Amount, Bank, Reference, Beneficiary, Date). OMIT anything not stated; never invent values.'
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

// App Parse + post back
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
const fields = Array.isArray(parsed.fields)
  ? parsed.fields
      .filter(f => f && f.label != null && f.value != null && String(f.value).trim() !== '')
      .map(f => ({ label: String(f.label), value: String(f.value) }))
  : [];
const hasFile = $node['App Extract'].json.hasFile;
return [{ json: {
  extraction: {
    classification: parsed.classification,
    extractedAmount: (amt != null) ? String(amt) : undefined,
    extractedPaymentMethod: parsed.payment_method || undefined,
    slipRef: parsed.deposit_slip_ref || undefined,
    fields,
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
  name: 'Orbit Flow',
  nodes,
  connections,
  active: false,
  settings: { executionOrder: 'v1' },
  pinData: {},
  meta: { templateCredsSetupCompleted: false },
  tags: [],
};

const out = path.join(__dirname, 'irbas_orbit_flow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2));
console.log('Wrote', out, 'with', nodes.length, 'nodes.');

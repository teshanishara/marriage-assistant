const express = require('express');
const cors = require('cors');
const { fetch } = require('undici');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

if (!OPENAI_KEY) {
  console.error('OPENAI_API_KEY is not set. Please set it in your environment.');
}

let malePrompt = { system_prompt: '' };
let femalePrompt = { system_prompt: '' };
let moderation = null;

try {
  malePrompt = JSON.parse(fs.readFileSync(path.join(__dirname, 'prompts', 'male.json')));
  femalePrompt = JSON.parse(fs.readFileSync(path.join(__dirname, 'prompts', 'female.json')));
  moderation = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'moderation_rules.json')));
} catch (err) {
  console.error('Error loading prompt or moderation files:', err.message);
  moderation = moderation || {
    pre_block_regexes: [],
    red_flag_regexes: [],
    escalation_texts: {},
    generic_escalation: 'That sounds serious. If you are in immediate danger, call local emergency services.',
    refusal_text: "I can't provide explicit sexual instructions or sexual content involving minors. I can help with medical information, communication scripts, or referrals. Which of those would you like?"
  };
}

const SESSIONS = {};

function detectRedFlags(text) {
  if (!text || !moderation || !Array.isArray(moderation.red_flag_regexes)) return { match: false };
  const lowered = text.toLowerCase();
  for (const r of moderation.red_flag_regexes) {
    try {
      const re = new RegExp(r.pattern, 'i');
      if (re.test(lowered)) return { match: true, id: r.id, severity: r.severity };
    } catch (e) {
      continue;
    }
  }
  return { match: false };
}

function preModerationBlock(text) {
  if (!text || !moderation || !Array.isArray(moderation.pre_block_regexes)) return false;
  const lowered = text.toLowerCase();
  for (const pat of moderation.pre_block_regexes) {
    try {
      const re = new RegExp(pat, 'i');
      if (re.test(lowered)) return true;
    } catch (e) {
      continue;
    }
  }
  return false;
}

async function callOpenAI(messages) {
  const payload = {
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.2,
    max_tokens: 800
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI request failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  return content || '';
}

app.post('/start-session', (req, res) => {
  const { persona, ageConfirmed, intake } = req.body || {};
  if (!ageConfirmed) return res.status(400).json({ error: 'Age must be confirmed (18+).' });
  const id = uuidv4();
  SESSIONS[id] = { id, persona: persona === 'male' ? 'male' : 'female', intake: intake || '', messages: [], createdAt: Date.now(), flagged: false };
  return res.json({ sessionId: id });
});

app.post('/message', async (req, res) => {
  const { sessionId, text } = req.body || {};
  if (!sessionId || typeof text !== 'string') return res.status(400).json({ error: 'sessionId and text are required.' });
  const s = SESSIONS[sessionId];
  if (!s) return res.status(404).json({ error: 'Session not found' });

  if (preModerationBlock(text)) {
    return res.json({ reply: moderation.refusal_text });
  }

  const rf = detectRedFlags(text);
  if (rf.match) {
    s.flagged = true;
    s.flag = rf;
    const reply = moderation.escalation_texts && moderation.escalation_texts[rf.id] ? moderation.escalation_texts[rf.id] : moderation.generic_escalation;
    return res.json({ reply });
  }

  const personaPrompt = s.persona === 'male' ? malePrompt.system_prompt : femalePrompt.system_prompt;
  const messages = [
    { role: 'system', content: personaPrompt },
    { role: 'system', content: `Intake: ${JSON.stringify(s.intake || {})}` }
  ];
  for (const m of s.messages) messages.push(m);
  messages.push({ role: 'user', content: text });

  try {
    const reply = await callOpenAI(messages);
    const rfPost = detectRedFlags(`${text}\n${reply}`);
    if (rfPost.match) {
      s.flagged = true;
      s.flag = rfPost;
      const replyEsc = moderation.escalation_texts && moderation.escalation_texts[rfPost.id] ? moderation.escalation_texts[rfPost.id] : moderation.generic_escalation;
      return res.json({ reply: replyEsc });
    }

    s.messages.push({ role: 'user', content: text });
    s.messages.push({ role: 'assistant', content: reply });

    return res.json({ reply });
  } catch (err) {
    console.error('LLM error:', err.message);
    return res.status(500).json({ error: 'LLM call failed' });
  }
});

app.post('/delete-session', (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  if (SESSIONS[sessionId]) {
    delete SESSIONS[sessionId];
    return res.json({ deleted: true });
  }
  return res.status(404).json({ error: 'Session not found' });
});

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

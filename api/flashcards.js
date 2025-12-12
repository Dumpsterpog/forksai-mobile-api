import { db } from "./firebaseAdmin.js";
import admin from "firebase-admin";

/* ------------------------------------------------------------------
   ROBUST PARSER (same version as in pdfToFlashcards.js)
------------------------------------------------------------------- */
function robustParseFlashcards(rawText) {
  console.log("🟡 RAW GEMINI OUTPUT (first 500 chars):", rawText.slice(0, 500));

  let s = (rawText || "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();

  // Replace smart quotes
  s = s
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"');

  const tryParse = (str) => {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  };

  // Fast parse
  let parsed = tryParse(s);
  if (parsed) {
    console.log("🟢 PARSED JSON (fast path):", parsed);
    return parsed;
  }

  // Escape bad backslashes
  let attempt = s.replace(/\\(?!["\\\/bfnrtu])/g, "\\\\");
  parsed = tryParse(attempt);
  if (parsed) {
    console.log("🟢 PARSED AFTER ESCAPING SLASHES:", parsed);
    return parsed;
  }

  // Extract array/object substring
  const findJSON = (str, open, close) => {
    const start = str.indexOf(open);
    const end = str.lastIndexOf(close);
    if (start === -1 || end === -1 || end <= start) return null;
    return str.substring(start, end + 1);
  };

  let extracted =
    findJSON(attempt, "[", "]") || findJSON(attempt, "{", "}");
  if (extracted) {
    parsed = tryParse(extracted);
    if (parsed) {
      console.log("🟢 PARSED JSON (substring extraction):", parsed);
      return parsed;
    }

    extracted = extracted.replace(/\\(?!["\\\/bfnrtu])/g, "\\\\");
    parsed = tryParse(extracted);
    if (parsed) {
      console.log("🟢 PARSED JSON (substring + escape):", parsed);
      return parsed;
    }
  }

  // Fix trailing commas
  attempt = attempt.replace(/,(\s*[}\]])/g, "$1");
  parsed = tryParse(attempt);
  if (parsed) {
    console.log("🟢 PARSED AFTER TRAILING COMMA FIX:", parsed);
    return parsed;
  }

  // Fix unquoted keys
  attempt = attempt.replace(
    /([{,]\s*)([A-Za-z0-9_@\-]+)\s*:/g,
    '$1"$2":'
  );
  parsed = tryParse(attempt);
  if (parsed) {
    console.log("🟢 PARSED AFTER QUOTING KEYS:", parsed);
    return parsed;
  }

  // Fix single quoted strings
  attempt = attempt.replace(/'([^']*)'/g, (_, x) => `"${x.replace(/"/g, '\\"')}"`);
  parsed = tryParse(attempt);
  if (parsed) {
    console.log("🟢 PARSED AFTER FIXING SINGLE QUOTES:", parsed);
    return parsed;
  }

  // Fully escape
  attempt = attempt.replace(/\\/g, "\\\\");
  parsed = tryParse(attempt);
  if (parsed) {
    console.log("🟢 PARSED AFTER FULL ESCAPE:", parsed);
    return parsed;
  }

  // Q/A fallback
  const qa = [];
  const lines = rawText.split(/\r?\n/);
  let q = null;
  let a = null;

  for (let line of lines.map((l) => l.trim())) {
    if (/^(Q[:\s]|Question[:\s])/i.test(line)) {
      if (q) qa.push({ q, a: a || "" });
      q = line.replace(/^(Q[:\s]|Question[:\s])/i, "").trim();
      a = "";
    } else if (/^(A[:\s]|Answer[:\s])/i.test(line)) {
      a = line.replace(/^(A[:\s]|Answer[:\s])/i, "").trim();
    } else if (a && line) {
      a += " " + line;
    } else if (q && line) {
      q += " " + line;
    }
  }

  if (q) qa.push({ q, a: a || "" });

  if (qa.length) {
    console.log("🟡 PARSED AS Q/A LIST:", qa);
    return qa;
  }

  console.log("🔴 FLASHCARD PARSING FAILED. Returning fallback.");
  return [
    {
      q: "Flashcard parsing failed",
      a: (rawText || "").slice(0, 200),
    },
  ];
}

/* ------------------------------------------------------------------
   MAIN HANDLER
------------------------------------------------------------------- */
export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { userId, notes, difficulty = "medium", limit = 12 } = req.body;

    console.log("📝 REQUEST RECEIVED:", { userId, notesLength: notes?.length, difficulty, limit });

    if (!userId) return res.status(400).json({ error: "Missing userId" });
    if (!notes || !notes.trim())
      return res.status(400).json({ error: "Notes required" });

    const ALLOWED = ["easy", "medium", "hard"];
    const diff = ALLOWED.includes(difficulty) ? difficulty : "medium";
    const cardLimit = parseInt(limit) || 12;

    /* ------------------------------
       GEMINI FLASHCARD GENERATION
    ------------------------------- */
    const flashPrompt = `
Turn the following notes into exactly ${cardLimit} flashcards.
Difficulty: ${diff}

Rules:
- Output MUST be valid JSON:
  [
    { "q": "question", "a": "answer" }
  ]
- No markdown.
- No explanation.
- JSON ONLY.

NOTES:
${notes}
`;

    const model = "gemini-2.5-flash";
    const result = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: flashPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 24000 },
        }),
      }
    );

    const json = await result.json();

    console.log("🟡 GEMINI RAW RESPONSE OBJECT:", JSON.stringify(json, null, 2).slice(0, 1000));

    const rawOut = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const flashcards = robustParseFlashcards(rawOut);

    console.log("🟢 FINAL FLASHCARDS:", flashcards);

    /* ------------------------------
       TITLE GENERATION
    ------------------------------- */
    const titlePrompt = `
Extract a short, clean title for these notes.
Return ONLY the title. No quotes.

${notes.slice(0, 300)}
`;

    const tRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: titlePrompt }] }],
        }),
      }
    );

    const tJson = await tRes.json();
    const title =
      tJson?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "Untitled Deck";

    /* ------------------------------
       SAVE TO FIRESTORE
    ------------------------------- */
    const deckRef = await db.collection("flashcardDecks").add({
      userId,
      title,
      difficulty: diff,
      source: "text",
      flashcards,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log("🟢 SAVED DECK:", deckRef.id);

    return res.status(200).json({
      deckId: deckRef.id,
      flashcards,
      title,
    });
  } catch (err) {
    console.error("🔥 API ERROR:", err);
    return res.status(500).json({
      error: err.message || "Internal error",
    });
  }
}

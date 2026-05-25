// shared/pgn-parser.js
// Functionality: Validates and normalizes PGN strings, extracts structured game data.
//   - Checks for required elements (move numbers, piece notation)
//   - Strips whitespace, normalizes line endings
//   - Parses PGN headers into structured game metadata
//   - Validates each move structurally to catch invalid PGNs before Lichess injection
//   - Provides minimal validation before Lichess redirect
// Inputs: raw string (potential PGN)
// Outputs: boolean isValid, string normalized, object gameData, object moveValidation

function validatePGN(raw) {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (trimmed.length < 10) return false;
  const hasMoveNumber = /\d+\.\s*[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]/.test(trimmed);
  if (!hasMoveNumber) return false;
  return true;
}

function normalizePGN(raw) {
  return raw.replace(/\s+/g, ' ').trim();
}

function stripPGNHeaders(raw) {
  return raw.replace(/^\[.*?\]\s*/gm, '').trim();
}

function parsePGNHeaders(pgn) {
  const headers = {};
  const lines = pgn.split('\n');
  const tagRe = /^\[\s*(\w+)\s*"([^"]*)"\s*\]$/;
  for (const line of lines) {
    const match = line.match(tagRe);
    if (match) {
      headers[match[1]] = match[2];
    }
  }
  return headers;
}

function extractGameData(pgn) {
  const headers = parsePGNHeaders(pgn);
  return {
    date: headers.Date || '',
    white: headers.White || '',
    black: headers.Black || '',
    result: headers.Result || '*',
    timeControl: headers.TimeControl || headers.Time || '',
    event: headers.Event || '',
    site: headers.Site || ''
  };
}

function generateGameId(pgn) {
  const h = parsePGNHeaders(pgn);
  const key = (h.Date || '') + (h.White || '') + (h.Black || '') + (h.Result || '') + (h.TimeControl || '');
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }
  return 'g_' + Math.abs(hash).toString(36);
}

function validateMoves(pgn) {
  const movesPart = stripPGNHeaders(pgn);
  const clean = movesPart.replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/, '').trim();
  if (!clean) return { valid: false, reason: 'no_moves' };

  const tokens = clean.split(/\s+/);
  const pawnRe = /^[a-h](x[a-h][1-8]|[1-8])(=[QRBN])?[+#]?$/;
  const pieceRe = /^[KQRBN][a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?$/;
  const castleRe = /^O-O(-O)?[+#]?$/;
  const numRe = /^\d+\.\.?\.?$/;

  for (const token of tokens) {
    if (numRe.test(token)) continue;
    if (pawnRe.test(token)) continue;
    if (pieceRe.test(token)) continue;
    if (castleRe.test(token)) continue;
    return { valid: false, reason: 'invalid_move', token: token };
  }
  return { valid: true };
}

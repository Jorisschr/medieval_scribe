import { NOUNS, WORDS } from './dictionary.js';
import { analyze, inflect } from './morphology.js';
import { applyCase, applySpelling, casePattern, toLower } from './spelling.js';

const nouns = new Map(Object.entries(NOUNS));
const words = new Map(Object.entries(WORDS).filter(([key]) => !key.includes(' ')));

// Multi-word entries, indexed by their first word, longest first.
const phrases = new Map();
for (const [key, replacements] of Object.entries(WORDS)) {
    const parts = key.split(' ');
    if (parts.length < 2) continue;
    if (!phrases.has(parts[0])) phrases.set(parts[0], []);
    phrases.get(parts[0]).push({ parts, replacements });
}
for (const list of phrases.values()) list.sort((a, b) => b.parts.length - a.parts.length);
const MAX_PHRASE_WORDS = Math.max(1, ...[...phrases.values()].flat().map(phrase => phrase.parts.length));

// Splitting on a capturing group gives [separator, word, separator, word, ..., separator],
// so words always sit at odd indices.
const WORD = /([\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*)/u;

function tokenize(text) {
    return text.split(WORD);
}

function normalize(word) {
    return toLower(word).normalize('NFC').replace(/’/g, "'");
}

function pick(items, random) {
    return items[Math.floor(random() * items.length)];
}

function convertWord(word, random) {
    const lower = normalize(word);
    let result;
    const replacements = words.get(lower) ?? nouns.get(lower);
    if (replacements) {
        result = pick(replacements, random);
    } else {
        const form = analyze(lower, stem => nouns.has(stem));
        result = form ? inflect(pick(nouns.get(form.stem), random), form) : applySpelling(lower);
    }
    return applyCase(result.replace(/[[\]]/g, ''), casePattern(word));
}

// Tries to match a multi-word entry starting at word token i, without going past token `end`.
function matchPhrase(tokens, i, end, random) {
    const candidates = phrases.get(normalize(tokens[i]));
    if (!candidates) return null;
    for (const { parts, replacements } of candidates) {
        const last = i + 2 * (parts.length - 1);
        if (last >= end) continue;
        let matches = true;
        for (let k = 1; k < parts.length && matches; k++) {
            matches = /^\s+$/.test(tokens[i + 2 * k - 1]) && normalize(tokens[i + 2 * k]) === parts[k];
        }
        if (matches) {
            const out = applyCase(pick(replacements, random), casePattern(tokens[i]));
            return { from: i, to: last + 1, out };
        }
    }
    return null;
}

// Converts tokens [from, to) into segments: { from, to, out } covering that range.
// `previous` maps token indices of unchanged words to their earlier output.
function convertRange(tokens, from, to, random, previous) {
    const segments = [];
    let i = from;
    while (i < to) {
        if (i % 2 === 0) {
            segments.push({ from: i, to: i + 1, out: tokens[i] });
            i++;
            continue;
        }
        const segment = matchPhrase(tokens, i, to, random)
            ?? { from: i, to: i + 1, out: previous.get(i) ?? convertWord(tokens[i], random) };
        segments.push(segment);
        i = segment.to;
    }
    return segments;
}

// Phrases can span several words, so segments this close to an edit are converted again.
const MARGIN = 2 * (MAX_PHRASE_WORDS - 1);

// Converts text as it is being typed. Each update only converts the words around
// what changed and keeps the earlier output (and its random picks) everywhere else.
export class Scribe {
    #tokens = [];
    #segments = [];
    #random;

    constructor({ random = Math.random } = {}) {
        this.#random = random;
    }

    update(text) {
        const tokens = tokenize(text);
        const old = this.#tokens;

        const limit = Math.min(old.length, tokens.length);
        let head = 0;
        while (head < limit && old[head] === tokens[head]) head++;
        let tail = 0;
        while (tail < limit - head && old[old.length - 1 - tail] === tokens[tokens.length - 1 - tail]) tail++;

        const shift = tokens.length - old.length;
        const kept = this.#segments;
        let before = 0;
        while (before < kept.length && kept[before].to <= head - MARGIN) before++;
        let after = kept.length;
        while (after > before && kept[after - 1].from >= old.length - tail + MARGIN) after--;

        const tailSegments = kept.slice(after).map(s => ({ from: s.from + shift, to: s.to + shift, out: s.out }));
        const from = before > 0 ? kept[before - 1].to : 0;
        const to = tailSegments.length > 0 ? tailSegments[0].from : tokens.length;

        // Unchanged single words in the margin keep their output, so synonyms don't change.
        // Old phrases are converted again, since the edit may have broken them up.
        const previous = new Map();
        for (const s of kept.slice(before, after)) {
            if (s.to - s.from !== 1) continue;
            if (s.to <= head) previous.set(s.from, s.out);
            else if (s.from >= old.length - tail) previous.set(s.from + shift, s.out);
        }

        this.#segments = [
            ...kept.slice(0, before),
            ...convertRange(tokens, from, to, this.#random, previous),
            ...tailSegments,
        ];
        this.#tokens = tokens;
        return this.#segments.map(s => s.out).join('');
    }
}

export function convert(text, options) {
    return new Scribe(options).update(text);
}

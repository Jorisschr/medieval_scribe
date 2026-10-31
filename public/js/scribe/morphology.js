// Dutch plurals and diminutives: recognising them in the input (analyze)
// and building them for a replacement (inflect). Heuristic, not exhaustive.

// Splits off the last vowel group: postduif → { onset: 'postd', vowels: 'ui', coda: 'f' }
function lastSyllable(word) {
    const match = word.match(/^(.*?)([aeiouyë]+)([^aeiouyë]*)$/);
    return match && { onset: match[1], vowels: match[2], coda: match[3] };
}

function syllableCount(word) {
    return (word.match(/[aeiouyë]+/g) || []).length;
}

// Unstressed final syllables like -el, -er, -en, -em: makker, gezel
function isSchwa(word, syllable) {
    return syllable.vowels === 'e' && 'lrnm'.includes(syllable.coda) && syllableCount(word) > 1;
}

// A single short vowel before a single consonant: bal, ros, grap, telegram
function endsInShortVowel(word, syllable) {
    return syllable.vowels.length === 1 && 'aeiou'.includes(syllable.vowels)
        && syllable.coda.length === 1 && !isSchwa(word, syllable);
}

export function pluralize(word) {
    const syllable = lastSyllable(word);
    if (!syllable) return word + 's';

    if (!syllable.coda) {
        if (/(?:ei|ui|ou|au)$/.test(word)) return word + 'en';          // schrijflei → schrijfleien
        if (word.endsWith('ee')) return word + 'ën';                    // zee → zeeën
        if (syllable.vowels.length === 1 && word.endsWith('e')) return word + 's';  // taverne → tavernes
        if (syllable.vowels.length === 1) return word + "'s";           // auto → auto's
        return word + 's';
    }
    if (isSchwa(word, syllable) || word.endsWith('ier')) return word + 's';   // makker → makkers
    if (endsInShortVowel(word, syllable)) return word + syllable.coda + 'en';  // ros → rossen

    let stem = word;
    const { onset, vowels, coda } = syllable;
    if (coda.length === 1 && vowels.length === 2 && vowels[0] === vowels[1]) {
        stem = onset + vowels[0] + coda;                                // blaaskaak → blaaskaken
    }
    if (coda.length === 1) {
        stem = stem.replace(/f$/, 'v');                                // postduif → postduiven
    }
    return stem + 'en';
}

export function diminutive(word) {
    const syllable = lastSyllable(word);
    if (!syllable) return word + 'je';

    const { vowels, coda } = syllable;
    if (!coda) {
        if (vowels.length === 1 && 'aou'.includes(vowels)) return word + vowels + 'tje';  // auto → autootje
        return word + 'tje';                                            // zee → zeetje
    }
    if (endsInShortVowel(word, syllable) && 'lnrm'.includes(coda)) {
        return word + coda + 'etje';                                    // bal → balletje
    }
    if (coda === 'ng') return word + 'etje';                            // ring → ringetje
    if (coda.length === 1 && 'lnrw'.includes(coda)) return word + 'tje';   // kompaen → kompaentje
    if (coda === 'm') return word + 'pje';                              // boom → boompje
    return word + 'je';                                                 // frats → fratsje
}

// Adds the endings described by form ({ plural, diminutive }) to a replacement.
// Multi-word replacements inflect the [bracketed] word, or else the last one.
export function inflect(replacement, form) {
    const words = replacement.split(' ');
    let head = words.findIndex(word => word.startsWith('['));
    if (head === -1) head = words.length - 1;

    let word = words[head].replace(/^\[|\]$/g, '');
    if (form.diminutive) word = diminutive(word);
    if (form.plural) word = form.diminutive ? word + 's' : pluralize(word);
    words[head] = word;
    return words.join(' ');
}

const SUFFIXES = [
    ['etjes', { plural: true, diminutive: true }],
    ['pjes', { plural: true, diminutive: true }],
    ['tjes', { plural: true, diminutive: true }],
    ['jes', { plural: true, diminutive: true }],
    ['etje', { plural: false, diminutive: true }],
    ['pje', { plural: false, diminutive: true }],
    ['tje', { plural: false, diminutive: true }],
    ['je', { plural: false, diminutive: true }],
    ['ën', { plural: true, diminutive: false }],
    ['en', { plural: true, diminutive: false }],
    ["'s", { plural: true, diminutive: false }],
    ['s', { plural: true, diminutive: false }],
];

// Possible base forms once an ending is removed: grapp → grap, autoo → auto, jar → jaar, postduiv → postduif
function stemCandidates(stem) {
    const candidates = [stem];
    if (/([^aeiouy])\1$/.test(stem)) candidates.push(stem.slice(0, -1));
    if (/([aeiou])\1$/.test(stem)) candidates.push(stem.slice(0, -1));
    if (/z$/.test(stem)) candidates.push(stem.slice(0, -1) + 's');
    if (/v$/.test(stem)) candidates.push(stem.slice(0, -1) + 'f');
    const shortVowel = stem.match(/^(.*[^aeiou])([aeiou])([^aeiouy])$/);
    if (shortVowel) candidates.push(shortVowel[1] + shortVowel[2] + shortVowel[2] + shortVowel[3]);
    return candidates;
}

// Finds a known noun inside a plural or diminutive: zonnetje → { stem: 'zon', diminutive: true, plural: false }
export function analyze(word, isKnown) {
    for (const [suffix, form] of SUFFIXES) {
        if (!word.endsWith(suffix) || word.length < suffix.length + 2) continue;
        for (const stem of stemCandidates(word.slice(0, -suffix.length))) {
            if (isKnown(stem)) return { stem, ...form };
        }
    }
    return null;
}

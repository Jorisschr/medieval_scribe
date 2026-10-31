// Spelling rules that make a modern Dutch word look medieval.
// They run in order on a single lowercase word, so ^ and $ mark word edges.
const RULES = [
    [/aa/g, 'ae'],                                                  // maan → maen
    [/(?<![aeiou])a(?=[bcdfghjklmnpqrstvwxz][aeiouy])/g, 'ae'],     // maken → maeken
    [/ij/g, 'y'],                                                   // mijn → myn
    [/ei/g, 'ey'],                                                  // klein → kleyn, moeilijk → moeylyk
    [/z/g, 's'],                                                    // zee → see
    [/ch/g, 'g'],                                                   // lachen → laghen, schrijven → sghryven
    [/c(?![eik])/g, 'k'],                                           // cola → kola
    [/(?<=.)(?<![cs])k+/g, 'ck'],                                   // ik → ick, makker → macker
    [/g+(?!h)/g, 'gh'],                                             // gaan → ghaen
    [/ooi/g, 'ooy'],                                                // mooi → mooy
    [/ui/g, 'uy'],                                                  // huis → huys
    [/d$/, 'dt'],                                                   // kind → kindt
    [/s$/, 'sch'],                                                  // mens → mensch
];

const cache = new Map();
const CACHE_LIMIT = 10_000;

export function applySpelling(word) {
    let result = cache.get(word);
    if (result === undefined) {
        result = word;
        for (const [pattern, replacement] of RULES) {
            result = result.replace(pattern, replacement);
        }
        if (cache.size >= CACHE_LIMIT) cache.clear();
        cache.set(word, result);
    }
    return result;
}

export function toLower(text) {
    return text.toLocaleLowerCase('nl');
}

// Returns 'lower', 'capital' or 'upper' depending on how the word is written.
export function casePattern(word) {
    const lower = toLower(word);
    if (word === lower) return 'lower';
    const upper = word.toLocaleUpperCase('nl');
    if (word === upper && [...word].length > 1) return 'upper';
    return word[0] === upper[0] ? 'capital' : 'lower';
}

export function applyCase(text, pattern) {
    if (pattern === 'upper') return text.toLocaleUpperCase('nl');
    if (pattern === 'capital') {
        // IJ is a single letter in Dutch, so both parts get capitalized
        if (text.startsWith('ij')) return 'IJ' + text.slice(2);
        return text.charAt(0).toLocaleUpperCase('nl') + text.slice(1);
    }
    return text;
}

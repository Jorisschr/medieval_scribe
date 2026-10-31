// Vocabulary swaps: modern words and their medieval counterparts.
// Replacements are used exactly as written; the spelling rules never touch them.
// When there are several replacements, one is picked at random.

// Nouns. Plurals and diminutives are derived automatically:
// feest → bal, feesten → ballen, feestje → balletje, feestjes → balletjes.
// In a multi-word replacement the last word gets the ending,
// unless another word is marked with [brackets].
export const NOUNS = {
    'afbeelding': ['beeltenis'],
    'auto': ['huifkar', 'koets'],
    'bericht': ['telegram'],
    'bier': ['gerstenat'],
    'bierfiets': ['[gerstenvat] op wielen'],
    'bob': ['koetsier'],
    'café': ['herberg', 'taveerne', 'taverne'],
    'cafe': ['herberg', 'taveerne', 'taverne'],
    'computer': ['schrijflei'],
    'feest': ['bal'],
    'fiets': ['stalen ros'],
    'foto': ['beeltenis'],
    'fuif': ['bal'],
    'grap': ['frats'],
    'gsm': ['postduif'],
    'mop': ['frats'],
    'opschepper': ['blaaskaak'],
    'selfie': ['zelfportret', 'zelfbeeltenis'],
    'smartphone': ['pientere postduif'],
    'sms': ['telegram'],
    'vriend': ['kompaen', 'gezel', 'metgezel', 'makker'],
    'zee': ['pekelveld'],
    'zon': ['hemelvlam'],
};

// Other words and phrases, replaced only when they match exactly.
// These win over derived noun forms, which is useful for irregular plurals.
export const WORDS = {
    'allemaal': ['eenieder', 'alleman'],
    'bierfietsen': ['gerstenvaten op wielen'],
    'cool': ['graaf', 'magisch', 'leuk'],
    'denk': ['peins'],
    'dorstig': ['natgierig'],
    'en': ['ende'],
    'grobbendonk': ['gabberdoenk', '2280'],
    'hallo': ['gegroet'],
    'heb dorst': ['ben natgierig'],
    'hey': ['gegroet'],
    'hoi': ['gegroet'],
    'iedereen': ['eenieder', 'alleman'],
    'joe': ['gegroet'],
    'jow': ['gegroet'],
    'loempe': ['knurft'],
    'maar': ['maer', 'doch'],
    'nice': ['mooi', 'zalig'],
    'onoprecht': ['achterkousig'],
    'tegenwoordig': ['jegenswoordig'],
    'verdoeme': ['drommels'],
    'vorselaar': ['veusseleir', 'veussel'],
    'vrienden': ['kompaenen', 'gezellen', 'metgezellen', 'makkers'],
};

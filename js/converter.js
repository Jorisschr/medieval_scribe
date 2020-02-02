let input = document.getElementById("input");
let output = document.getElementById("output");

input.addEventListener("input", processInput)
output.addEventListener("click", copyToClipboard)


// TODO: Capital letter compatibility

let dict = {
    'afbeelding': ['beeltenis'],
    'allemaal': ['eenieder', 'alleman'],
    'auto': ['huifkar', 'koets'],
    'bob': ['koetsier'],
    'bericht': ['telegram'],
    'bier': ['gerstenat'],
    'bierfiets': ['gerstenvat op wielen'],
    'café': ['herberg', 'taveerne', 'taverne'],
    'cafe': ['herberg', 'taveerne', 'taverne'],
    'computer': ['schrijflei'],
    'denk': ['peins'],
    'dorstig': ['natgierig'],
    ' en ': [' ende '],
    'feest': ['bal'],
    'feestje': ['bal'],
    'fiets([.!?:,; \n])': ['stalen ros$1'],
    'foto': ['beeltenis'],
    'fuif': ['bal'],
    'grap': ['frats'],
    'grobbendonk': ['gabberdoenk', '2280'],
    'gsm': ['postduif'],
    'hey': ['gegroet'],
    'heb dorst': ['natgierig'],
    'hoi': ['gegroet'],
    'hallo': ['gegroet'],
    'iedereen': ['eenieder', 'alleman'],
    'jow': ['gegroet'],
    'joe': ['gegroet'],
    'loempe': ['knurft'],
    'maar': ['maar', 'doch'],
    'mop': ['frats'],
    'onoprecht': ['achterkousig'],
    'opschepper': ['blaaskaak'],
    'selfie': ['zelfportret', 'zelfbeeltenis'],
    'smartphone': ['pientere postduif'],
    'sms': ['telegram'],
    'tegenwoordig': ['jegenswoordig'],
    'verdoeme': ['drommels'],
    'vorselaar': ['veusseleir', 'veussel'],
    'vriend': ['kompaen', 'gezel', 'metgezel', 'makker'],
    'vrienden': ['kompaenen', 'gezellen', 'metgezellen', 'makkers'],
    ' zee ': [' pekelveld '],
    ' zon ': [' hemelvlam '],
};


let rules = {
    'aa': 'ae',
    'a([zrtpqsdfghklmwxcvbn][aeuioy])': 'ae$1',
    'ij': 'y',
    'ei': 'ey',
    'z': 's',
    'ch': 'g',
    'c([^ie])': 'k$1',
    '([^ c])k+': '$1ck',
    'g+': 'gh',
    'ooi': 'ooy',
    'oei': 'oey',
    'ui': 'uy',
    'd([.!?:,; \n])': 'dt$1',
    's([.!?:,; \n])': 'sch$1',
};


function processInput() {
    // process input and return output
    output.value = convertText();
}


function convertText() {
    // convert the text in the input to medieval dutch
    // let words = input.value.split(' ');
    result = translate(input.value);
    result = applyRules(result);
    return result
}


function translate(text) {
    let result = text;
    for (const [key, value] of Object.entries(dict)) {
        result = result.replace(new RegExp(key, 'gi'), randomElement(value));
    }

    return result;
}


function applyRules(text) {
    let result = text;
    for (const [key, value] of Object.entries(rules)) {
        result = result.replace(new RegExp(key, 'gi'), value);
    }

    return result;
}


function randomElement(items) {
    return items[Math.floor(Math.random()*items.length)];
}


function copyToClipboard() {
    // Copy current output text to clipboard 
    output.select();
    document.execCommand('copy');
}

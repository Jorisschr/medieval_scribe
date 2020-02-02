let input = document.getElementById("input");
let output = document.getElementById("output");

input.addEventListener("input", processInput)
output.addEventListener("click", copyToClipboard)


let dict = {
    'afbeelding': 'beeltenis',
    'allemaal': randomElement(['eenieder', 'alleman']),
    'auto': randomElement(['huifkar', 'koets']),
    'bericht': 'telegram',
    'bier': 'gerstenat',
    'bierfiets': 'gerstenvat op wielen',
    'café': randomElement(['herberg', 'taveerne', 'taverne']),
    'computer': 'schrijflei',
    'en': 'ende',
    'feest': 'bal',
    'feestje': 'bal',
    'fiets': 'stalen ros',
    'foto': 'beeltenis',
    'fuif': 'bal',
    'gsm': 'postduif',
    'hey': 'gegroet',
    'hoi': 'gegroet',
    'hallo': 'gegroet',
    'iedereen': randomElement(['eenieder', 'alleman']),
    'jow': 'gegroet',
    'joe': 'gegroet',
    'maar': randomElement(['maar', 'doch']),
    'selfie': randomElement(['zelfportret', 'zelfbeeltenis']),
    'smartphone': 'pientere postduif',
    'sms': 'telegram',
    'vriend': randomElement(['kompaen', 'gezel', 'metgezel', 'makker']),
    'vrienden': randomElement(['kompaenen', 'gezellen', 'metgezellen', 'makkers']),
};


let rules = {
    'aa': 'ae',
    'ij': 'y',
    'ei': 'ey',
    'z': 's',
    'kk': 'ck',
    'k': 'ck',
    ' ck': ' k',
    'gg': 'gh',
    'g': 'gh',
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
    let words = input.value.split(' ');
    words = translate(words);
    result = applyRules(words.join(' '));
    return result
}


function translate(words) {
    return words.map(n => {
        if (n in dict) {
            return dict[n];
        } else {
            return n;
        }
    });
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

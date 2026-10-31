import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scribe, convert } from '../public/js/scribe/index.js';
import { analyze, diminutive, pluralize } from '../public/js/scribe/morphology.js';

// Always picks the first replacement, so results are predictable
const first = () => 0;
const medieval = text => convert(text, { random: first });

function cases(name, table) {
    test(name, () => {
        for (const [input, expected] of table) {
            assert.equal(medieval(input), expected, `input: ${JSON.stringify(input)}`);
        }
    });
}

cases('spelling rules', [
    ['maan', 'maen'],
    ['maken', 'maecken'],
    ['banaan', 'baenaen'],
    ['mijn', 'myn'],
    ['klein', 'kleyn'],
    ['moeilijk', 'moeylyck'],
    ['zonder', 'sonder'],
    ['lachen', 'laghen'],
    ['schrijven', 'sghryven'],
    ['cola', 'kola'],
    ['ik', 'ick'],
    ['werken', 'wercken'],
    ['kind', 'kindt'],
    ['gaan', 'ghaen'],
    ['mooi', 'mooy'],
    ['huis', 'huysch'],
    ['toen', 'toen'],
]);

cases('word endings are converted at the end of the text too', [
    ['kind', 'kindt'],
    ['Ik heb een fiets', 'Ick heb een stalen ros'],
    ['Ik heb een fiets.', 'Ick heb een stalen ros.'],
]);

cases('dictionary matches whole words only', [
    ['fotograaf', 'fotoghraef'],
    ['automatisch', 'automaetisgh'],
    ['grappig', 'ghrappigh'],
]);

cases('longest dictionary entry wins', [
    ['Ik heb een bierfiets', 'Ick heb een gerstenvat op wielen'],
    ['Mijn vrienden', 'Myn kompaenen'],
]);

cases('dictionary words at the start or end of a sentence', [
    ['Zee en zon', 'Pekelveld ende hemelvlam'],
    ['En toen kwam de zon.', 'Ende toen kwam de hemelvlam.'],
    ['zon, zee!', 'hemelvlam, pekelveld!'],
]);

cases('capital letters are preserved', [
    ['Hallo', 'Gegroet'],
    ['HALLO', 'GEGROET'],
    ['Aan de Zee', 'Aen de Pekelveld'],
    ['IJzer', 'Yser'],
    ['Ijs', 'Ysch'],
    ['IK HEB DORST', 'ICK BEN NATGIERIG'],
]);

cases('dictionary replacements are not respelled', [
    ['hallo', 'gegroet'],
    ['café', 'herberg'],
    ['cool', 'graaf'],
]);

cases('plurals and diminutives of dictionary nouns', [
    ['feestje', 'balletje'],
    ['feestjes', 'balletjes'],
    ['fietsen', 'stalen rossen'],
    ['zonnetje', 'hemelvlammetje'],
    ["auto's", 'huifkarren'],
    ['grapjes', 'fratsjes'],
    ['vriendje', 'kompaentje'],
    ['smartphones', 'pientere postduiven'],
    ["gsm's", 'postduiven'],
    ['bobbetje', 'koetsiertje'],
    ['cafés', 'herbergen'],
    ['bierfietsen', 'gerstenvaten op wielen'],
]);

cases('phrases', [
    ['ik heb dorst', 'ick ben natgierig'],
    ['Ik heb  dorst!', 'Ick ben natgierig!'],
    ['ik heb, dorst', 'ick heb, dorst'],
]);

cases('non-words pass through unchanged', [
    ['', ''],
    ['123 !?', '123 !?'],
    ['regel een\nregel twee', 'reghel een\nreghel twee'],
]);

test('pluralize', () => {
    const table = {
        bal: 'ballen', ros: 'rossen', huifkar: 'huifkarren', telegram: 'telegrammen',
        beeltenis: 'beeltenissen', zelfportret: 'zelfportretten', frats: 'fratsen',
        koets: 'koetsen', kompaen: 'kompaenen', blaaskaak: 'blaaskaken', postduif: 'postduiven',
        makker: 'makkers', koetsier: 'koetsiers', taverne: 'tavernes', schrijflei: 'schrijfleien',
        auto: "auto's", pekelveld: 'pekelvelden',
    };
    for (const [word, expected] of Object.entries(table)) assert.equal(pluralize(word), expected, word);
});

test('diminutive', () => {
    const table = {
        bal: 'balletje', hemelvlam: 'hemelvlammetje', telegram: 'telegrammetje', auto: 'autootje',
        kompaen: 'kompaentje', makker: 'makkertje', boom: 'boompje', ring: 'ringetje',
        frats: 'fratsje', herberg: 'herbergje', zee: 'zeetje',
    };
    for (const [word, expected] of Object.entries(table)) assert.equal(diminutive(word), expected, word);
});

test('analyze only recognises known nouns', () => {
    const known = new Set(['zon', 'grap', 'auto', 'feest']);
    const isKnown = word => known.has(word);
    assert.deepEqual(analyze('zonnetje', isKnown), { stem: 'zon', plural: false, diminutive: true });
    assert.deepEqual(analyze('grappen', isKnown), { stem: 'grap', plural: true, diminutive: false });
    assert.deepEqual(analyze('autootjes', isKnown), { stem: 'auto', plural: true, diminutive: true });
    assert.equal(analyze('toen', isKnown), null);
    assert.equal(analyze('zonder', isKnown), null);
});

// Feeds text to a Scribe one character at a time, like typing
function type(scribe, text, start = '') {
    let output;
    for (let i = start.length + 1; i <= text.length; i++) output = scribe.update(text.slice(0, i));
    return output;
}

test('typing gives the same result as converting at once', () => {
    const text = 'Hallo iedereen, ik heb dorst. Zullen we met de fiets naar het café gaan? En de auto\'s?';
    assert.equal(type(new Scribe({ random: first }), text), medieval(text));
});

test('earlier words keep their random pick while typing', () => {
    let calls = 0;
    const cycling = () => (calls++ % 4) / 4;
    const scribe = new Scribe({ random: cycling });

    const firstOutput = type(scribe, 'mijn vriend');
    const later = type(scribe, 'mijn vriend en nog een vriend en nog een vriend', 'mijn vriend');
    assert.ok(later.startsWith(firstOutput), `${later} should start with ${firstOutput}`);
});

test('editing in the middle only changes the edited word', () => {
    let calls = 0;
    const cycling = () => (calls++ % 4) / 4;
    const scribe = new Scribe({ random: cycling });

    const before = scribe.update('vriend vriend vriend');
    const after = scribe.update('vriend zon vriend');
    const [a, , c] = before.split(' ');
    assert.equal(after, `${a} hemelvlam ${c}`);
});

test('phrases are recognised when typed word by word', () => {
    const scribe = new Scribe({ random: first });
    assert.equal(type(scribe, 'ik heb dorst'), 'ick ben natgierig');
    assert.equal(scribe.update('ik heb dorst nu'), 'ick ben natgierig nu');
    assert.equal(scribe.update('ik heb nu'), 'ick heb nu');
});

test('clearing and pasting text', () => {
    const scribe = new Scribe({ random: first });
    scribe.update('hallo');
    assert.equal(scribe.update(''), '');
    assert.equal(scribe.update('zee en zon'), 'pekelveld ende hemelvlam');
});

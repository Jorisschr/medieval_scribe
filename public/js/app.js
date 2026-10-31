import { Scribe } from './scribe/index.js';

const input = document.getElementById('input');
const output = document.getElementById('output');
const copyButton = document.getElementById('copy');
const clearButton = document.getElementById('clear');
const toast = document.getElementById('toast');
const scribe = new Scribe();

let writingTimer;
let toastTimer;

function render() {
    output.textContent = scribe.update(input.value);
    copyButton.disabled = output.textContent === '';

    // Lets the quill in the masthead write along while you type
    document.body.classList.add('is-writing');
    clearTimeout(writingTimer);
    writingTimer = setTimeout(() => document.body.classList.remove('is-writing'), 400);
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2000);
}

async function copyToClipboard() {
    try {
        await navigator.clipboard.writeText(output.textContent);
        showToast('Afschrift genomen');
    } catch {
        // The clipboard API needs HTTPS (or localhost); fall back to copying a selection
        const selection = getSelection();
        selection.selectAllChildren(output);
        const copied = document.execCommand('copy');
        selection.removeAllRanges();
        showToast(copied ? 'Afschrift genomen' : 'Kopiëren mislukt, selecteer de tekst zelf');
    }
}

function toRoman(number) {
    const numerals = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
        [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let result = '';
    for (const [value, numeral] of numerals) {
        while (number >= value) {
            result += numeral;
            number -= value;
        }
    }
    return result;
}

input.addEventListener('input', render);
copyButton.addEventListener('click', copyToClipboard);
clearButton.addEventListener('click', () => {
    input.value = '';
    render();
    input.focus();
});

document.getElementById('year').textContent = toRoman(new Date().getFullYear());
render();

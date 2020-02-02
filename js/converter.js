let input = document.getElementById("input");
let output = document.getElementById("output");

input.addEventListener("input", processInput)
output.addEventListener("click", copyToClipboard)


function processInput() {
    // process input and return output
    output.value = convertText()
}


function convertText() {
    // convert the text in the input to medieval dutch
    return input.value
}

function copyToClipboard() {
    // Copy current output text to clipboard 
    output.select();
    document.execCommand('copy');
    console.log("Copied to clipboard");
}

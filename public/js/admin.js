// Copy buttons and delete confirmations on the admin page

for (const button of document.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', async () => {
        const field = document.getElementById(button.dataset.copy);
        try {
            await navigator.clipboard.writeText(field.value);
        } catch {
            field.select();
            document.execCommand('copy');
        }
        button.textContent = 'Gekopieerd';
    });
}

for (const form of document.querySelectorAll('form[data-confirm]')) {
    form.addEventListener('submit', event => {
        if (!confirm(form.dataset.confirm)) event.preventDefault();
    });
}

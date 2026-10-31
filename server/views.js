// Server-rendered pages for login, invites and administration, in the same codex style as the app.

export function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// Tagged template that escapes every interpolated value, except arrays of
// already rendered parts and values wrapped with raw()
export function html(strings, ...values) {
    let out = strings[0];
    values.forEach((value, i) => {
        out += render(value) + strings[i + 1];
    });
    return new Raw(out);
}

class Raw {
    constructor(value) {
        this.value = value;
    }

    toString() {
        return this.value;
    }
}

function render(value) {
    if (value instanceof Raw) return value.value;
    if (Array.isArray(value)) return value.map(render).join('');
    if (value === false || value === null || value === undefined) return '';
    return escapeHtml(value);
}

function formatDate(ms) {
    return new Date(ms).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' });
}

const CORNERS = html`
    <span class="corner corner--tl" aria-hidden="true"></span>
    <span class="corner corner--tr" aria-hidden="true"></span>
    <span class="corner corner--bl" aria-hidden="true"></span>
    <span class="corner corner--br" aria-hidden="true"></span>`;

export function accountNav(user) {
    if (!user) return html``;
    return html`
        <nav class="account" aria-label="Account">
            <span class="account__name">${user.username}</span>
            ${user.isAdmin && html`<a class="account__link" href="/admin">Beheer</a>`}
            <form method="post" action="/logout">
                <button class="account__link" type="submit">Afmelden</button>
            </form>
        </nav>`;
}

function page({ title, user, wide = false, scripts = [] }, content) {
    return html`<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>${title} · Medieval Scribe</title>
    <meta name="theme-color" content="#1a120b">
    <link rel="icon" href="/images/medieval_feather.PNG">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Grenze+Gotisch:wght@400;500;700&family=IM+Fell+English:ital@0;1&family=UnifrakturMaguntia&display=swap">
    <link rel="stylesheet" href="/css/style.css">
    ${scripts.map(src => html`<script type="module" src="${src}"></script>`)}
</head>
<body>
    ${accountNav(user)}
    <header class="masthead masthead--compact">
        <a class="masthead__home" href="/">
            <h1 class="masthead__title">Medieval Scribe</h1>
        </a>
    </header>
    <main class="sheet${wide ? ' sheet--wide' : ''}">
        <section class="folio folio--single">
            ${CORNERS}
            ${content}
        </section>
    </main>
</body>
</html>`.toString();
}

function errorNote(message) {
    return message ? html`<p class="note note--error" role="alert">${message}</p>` : html``;
}

export function loginPage({ error, username = '' } = {}) {
    return page({ title: 'Aenmelden' }, html`
        <h2 class="rubric">Aenmelden</h2>
        <p class="sheet__intro">Deze schryfkamer is alleen toegankelijk op uitnodiging.</p>
        ${errorNote(error)}
        <form class="form" method="post" action="/login">
            <label class="field">
                <span class="field__label">Gebruikersnaam</span>
                <input class="field__input" name="username" value="${username}" autocomplete="username"
                       autocapitalize="none" required autofocus>
            </label>
            <label class="field">
                <span class="field__label">Wachtwoord</span>
                <input class="field__input" name="password" type="password" autocomplete="current-password" required>
            </label>
            <div class="form__actions">
                <button class="seal-button" type="submit">Treed binnen</button>
            </div>
        </form>`);
}

export function invitePage({ invite, token, error, username = '' }) {
    return page({ title: 'Uitnodiging' }, html`
        <h2 class="rubric">Welkom, schryver</h2>
        <p class="sheet__intro">
            U bent uitgenodigd${invite.label && html` voor <em>${invite.label}</em>`}.
            Kies een gebruikersnaam en wachtwoord om binnen te treden.
        </p>
        ${errorNote(error)}
        <form class="form" method="post" action="/invite/${token}">
            <label class="field">
                <span class="field__label">Gebruikersnaam</span>
                <input class="field__input" name="username" value="${username}" autocomplete="username"
                       autocapitalize="none" minlength="3" maxlength="32" pattern="[A-Za-z0-9_.\\-]+" required autofocus>
                <span class="field__hint">3 tot 32 tekens: letters, cijfers, punt, streepje of underscore</span>
            </label>
            <label class="field">
                <span class="field__label">Wachtwoord</span>
                <input class="field__input" name="password" type="password" autocomplete="new-password"
                       minlength="10" maxlength="200" required>
                <span class="field__hint">Minstens 10 tekens</span>
            </label>
            <label class="field">
                <span class="field__label">Herhaal wachtwoord</span>
                <input class="field__input" name="confirm" type="password" autocomplete="new-password" required>
            </label>
            <div class="form__actions">
                <button class="seal-button" type="submit">Account aanmaken</button>
            </div>
        </form>`);
}

export function messagePage({ title, message, user }) {
    return page({ title, user }, html`
        <h2 class="rubric">${title}</h2>
        <p class="sheet__intro">${message}</p>
        <p class="sheet__intro"><a class="link" href="/">Terug naar de schryfkamer</a></p>`);
}

const STATUS_LABELS = {
    active: 'Actief',
    used: 'Opgebruikt',
    expired: 'Verlopen',
    revoked: 'Ingetrokken',
};

export function adminPage({ user, invites, users, newLink, error, inviteStatus }) {
    return page({ title: 'Beheer', user, wide: true, scripts: ['/js/admin.js'] }, html`
        <h2 class="rubric">Beheer</h2>

        <h3 class="section-title">Nieuwe uitnodiging</h3>
        ${errorNote(error)}
        ${newLink && html`
            <div class="note note--success">
                <p>Uitnodiging aangemaakt. Kopieer de link nu: hij wordt maar één keer getoond.</p>
                <div class="copy-field">
                    <input class="field__input" id="new-link" value="${newLink}" readonly>
                    <button class="seal-button" type="button" data-copy="new-link">Kopieer</button>
                </div>
            </div>`}
        <form class="form form--inline" method="post" action="/admin/invites">
            <label class="field">
                <span class="field__label">Omschrijving</span>
                <input class="field__input" name="label" maxlength="60" placeholder="bv. Ridders van de ronde tafel">
            </label>
            <label class="field field--small">
                <span class="field__label">Aantal personen</span>
                <input class="field__input" name="maxUses" type="number" min="1" max="1000" value="1" required>
            </label>
            <label class="field field--small">
                <span class="field__label">Geldig (dagen)</span>
                <input class="field__input" name="days" type="number" min="1" max="365" value="7" required>
            </label>
            <div class="form__actions">
                <button class="seal-button" type="submit">Maak link</button>
            </div>
        </form>

        <h3 class="section-title">Uitnodigingen</h3>
        ${invites.length === 0 ? html`<p class="sheet__intro">Nog geen uitnodigingen.</p>` : html`
            <div class="table-wrap">
                <table class="ledger">
                    <thead>
                        <tr><th>Omschrijving</th><th>Gebruikt</th><th>Verloopt</th><th>Status</th><th></th></tr>
                    </thead>
                    <tbody>
                        ${invites.map(invite => {
                            const status = inviteStatus(invite);
                            return html`
                                <tr>
                                    <td>${invite.label || html`<em class="muted">geen omschrijving</em>`}</td>
                                    <td>${invite.uses} / ${invite.max_uses}</td>
                                    <td>${formatDate(invite.expires_at)}</td>
                                    <td><span class="badge badge--${status}">${STATUS_LABELS[status]}</span></td>
                                    <td class="ledger__action">
                                        ${status === 'active' && html`
                                            <form method="post" action="/admin/invites/${invite.id}/revoke">
                                                <button class="text-button" type="submit">Intrekken</button>
                                            </form>`}
                                    </td>
                                </tr>`;
                        })}
                    </tbody>
                </table>
            </div>`}

        <h3 class="section-title">Gebruikers</h3>
        <div class="table-wrap">
            <table class="ledger">
                <thead>
                    <tr><th>Naam</th><th>Via</th><th>Sinds</th><th>Laatst aangemeld</th><th></th></tr>
                </thead>
                <tbody>
                    ${users.map(row => html`
                        <tr>
                            <td>${row.username}${row.is_admin === 1 && html` <span class="badge badge--admin">Beheerder</span>`}</td>
                            <td>${row.invite_label || (row.invite_id ? html`<em class="muted">uitnodiging</em>` : '–')}</td>
                            <td>${formatDate(row.created_at)}</td>
                            <td>${row.last_login_at ? formatDate(row.last_login_at) : '–'}</td>
                            <td class="ledger__action">
                                ${row.is_admin !== 1 && html`
                                    <form method="post" action="/admin/users/${row.id}/delete" data-confirm="${row.username} verwijderen?">
                                        <button class="text-button" type="submit">Verwijderen</button>
                                    </form>`}
                            </td>
                        </tr>`)}
                </tbody>
            </table>
        </div>`);
}

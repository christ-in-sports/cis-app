/**
 * The one look every email shares: the Supabase Auth templates (generated from
 * `auth-templates.ts` into `supabase/templates/`) and the Resend emails.
 *
 * Colours are the light-theme values of `design/tokens.css` ("Home and away v2",
 * ENG-32), copied as literals because mail clients cannot read CSS variables.
 * The colour jobs hold here too: slate is the one button, ink carries the text
 * and heavy rules, and nothing in an email is orange or sage -- an email is
 * neither a score nor a verse. Emails are light only: most mail apps restyle or
 * ignore dark-mode CSS, and the tokens' dark values would not survive that.
 *
 * Table layout and inline styles, because that is what mail clients render
 * reliably. Caprasimo and Figtree load from Google Fonts; apps that block web
 * fonts (Gmail) fall back to Georgia and Arial.
 *
 * Every helper takes HTML it is given as-is. Escape anything a person typed with
 * `escapeHtml` before passing it in.
 */

export const EMAIL_COLORS = {
  page: '#F5F1E8', // --cis-page
  paper: '#F7F3EA', // --cis-paper
  paperLight: '#FFFDF8', // --cis-paper-light
  ink: '#1F2A33', // --cis-ink
  inkDark: '#1A232B', // --cis-ink-dark, heavy rules
  inkMuted: '#5F5850', // --cis-ink-muted
  ruleDash: '#D8CFBE', // --cis-rule-dash
  action: '#24313D', // --cis-action
  inkOnAction: '#FFFEFA', // --cis-ink-on-action
} as const;

const C = EMAIL_COLORS;
const DISPLAY = "'Caprasimo', Georgia, 'Times New Roman', serif";
const BODY = "'Figtree', Arial, Helvetica, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A row of the sheet's single column. */
function row(padding: string, content: string, style = ''): string {
  return `            <tr>
              <td style="padding: ${padding};${style ? ` ${style}` : ''}">
                ${content}
              </td>
            </tr>`;
}

/** The sheet heading, in the display face (DESIGN_SYSTEM.md §5: headings only). */
export function heading(text: string): string {
  return row(
    '20px 24px 0',
    text,
    `font-family: ${DISPLAY}; font-size: 26px; line-height: 1.15; font-weight: normal; color: ${C.ink}; text-align: center;`,
  );
}

/** The 5px heavy ink rule under a sheet heading. */
export function heavyRule(): string {
  return row(
    '16px 24px 0',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr><td height="5" bgcolor="${C.inkDark}" style="height: 5px; line-height: 5px; font-size: 0; background-color: ${C.inkDark}; border-radius: 3px;">&nbsp;</td></tr>
                </table>`,
  );
}

/** The 2px dashed break between parts of a sheet (§6). */
export function dashedBreak(): string {
  return row(
    '20px 24px 0',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr><td height="0" style="height: 0; line-height: 0; font-size: 0; border-top: 2px dashed ${C.ruleDash};">&nbsp;</td></tr>
                </table>`,
  );
}

export function paragraph(html: string, { bold = false, first = false } = {}): string {
  return row(
    first ? '20px 24px 0' : '12px 24px 0',
    html,
    `font-family: ${BODY}; font-size: 16px; line-height: 1.5; color: ${C.ink};${bold ? ' font-weight: 700;' : ''}`,
  );
}

/** Small secondary copy, such as "expires in an hour". */
export function note(html: string): string {
  return row(
    '20px 24px 0',
    html,
    `font-family: ${BODY}; font-size: 14px; line-height: 1.5; color: ${C.inkMuted};`,
  );
}

/** A one-time code, large and spaced so it is easy to read off and type. */
export function codeBox(code: string): string {
  return row(
    '14px 24px 0',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="${C.paper}" style="padding: 16px 8px; background-color: ${C.paper}; border: 2px solid ${C.inkDark}; border-radius: 14px; font-family: ${BODY}; font-size: 38px; line-height: 1; font-weight: 800; letter-spacing: 8px; color: ${C.ink};">
                      ${code}
                    </td>
                  </tr>
                </table>`,
  );
}

/**
 * The primary button: a slate pill (the full pill radius is for buttons only).
 * `href` must already be escaped, or be a template placeholder.
 */
export function button(href: string, label: string): string {
  return row(
    '20px 24px 0',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="${C.action}" style="background-color: ${C.action}; border-radius: 999px;">
                      <a href="${href}" style="display: block; padding: 15px 24px; font-family: ${BODY}; font-size: 16px; line-height: 1.2; font-weight: 800; color: ${C.inkOnAction}; text-decoration: none; border-radius: 999px;">${label}</a>
                    </td>
                  </tr>
                </table>`,
  );
}

/** Label and value pairs, such as a registration summary. Both are HTML. */
export function details(items: { label: string; value: string }[]): string {
  const rows = items
    .map(
      ({ label, value }, i) => `<tr>
                    <td style="padding: ${i === 0 ? '0' : '10px'} 0 0; font-family: ${BODY}; font-size: 16px; line-height: 1.4; color: ${C.ink};">
                      <strong style="font-weight: 700;">${label}</strong><br />${value}
                    </td>
                  </tr>`,
    )
    .join('\n                  ');
  return row(
    '16px 24px 0',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${rows}
                </table>`,
  );
}

/**
 * The whole email: cream page, one paper sheet with the fish mark on top, and the
 * church footer. `preheader` is the line inbox lists show after the subject.
 */
export function emailLayout({
  title,
  preheader,
  logoUrl,
  body,
}: {
  title: string;
  preheader: string;
  /** Absolute URL of the fish mark; a template placeholder in the Auth templates. */
  logoUrl: string;
  /** Rows from the helpers above. */
  body: string[];
}): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <link
      href="https://fonts.googleapis.com/css2?family=Caprasimo&family=Figtree:wght@400;700;800&display=swap"
      rel="stylesheet"
    />
    <title>${title}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${C.page};">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: ${C.page};">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color: ${C.page};">
      <tr>
        <td align="center" style="padding: 24px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paperLight}" style="max-width: 440px; background-color: ${C.paperLight}; border-radius: 26px;">
            <tr>
              <td align="center" style="padding: 28px 24px 0;">
                <img src="${logoUrl}" alt="Christ in Sports" width="132" height="49" style="display: block; border: 0; width: 132px; height: auto;" />
              </td>
            </tr>
${body.join('\n')}
            <tr>
              <td style="padding: 28px 0 0; font-size: 0; line-height: 0;">&nbsp;</td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 440px;">
            <tr>
              <td align="center" style="padding: 16px 8px 0; font-family: ${BODY}; font-size: 12px; line-height: 1.5; color: ${C.inkMuted};">
                Christ in Sports &middot; St. Antonious Coptic Orthodox Church, Hayward
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

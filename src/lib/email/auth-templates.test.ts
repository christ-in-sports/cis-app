/**
 * The Supabase Auth templates in `supabase/templates/` are generated from
 * `auth-templates.ts`. This fails when a committed file has drifted from it;
 * `npm run emails:build` (this test with UPDATE_EMAIL_TEMPLATES=1) rewrites them.
 *
 * @jest-environment node
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { AUTH_TEMPLATES } from './auth-templates';
import { EMAIL_COLORS } from './layout';

const DIR = join(__dirname, '../../../supabase/templates');
const CONFIG = readFileSync(join(__dirname, '../../../supabase/config.toml'), 'utf8');

describe('Supabase Auth email templates', () => {
  it.each(AUTH_TEMPLATES)('$file matches what auth-templates.ts builds', ({ file, html }) => {
    const path = join(DIR, file);
    if (process.env.UPDATE_EMAIL_TEMPLATES) writeFileSync(path, html);
    expect(readFileSync(path, 'utf8')).toBe(html);
  });

  it.each(AUTH_TEMPLATES)('$file is wired up in config.toml with its subject', ({ file, subject }) => {
    expect(CONFIG).toContain(`content_path = "./supabase/templates/${file}"`);
    const block = CONFIG.slice(0, CONFIG.indexOf(`templates/${file}`));
    expect(block.slice(block.lastIndexOf('subject'))).toContain(`subject = "${subject}"`);
  });

  it('shows the code in the code emails and the link in the reset email', () => {
    const byFile = Object.fromEntries(AUTH_TEMPLATES.map((t) => [t.file, t.html]));
    expect(byFile['magic-link.html']).toContain('{{ .Token }}');
    expect(byFile['confirmation.html']).toContain('{{ .Token }}');
    // A code email has no link to tap: it would open in the mail app's browser.
    expect(byFile['magic-link.html']).not.toContain('{{ .ConfirmationURL }}');
    expect(byFile['recovery.html']).toContain('href="{{ .ConfirmationURL }}"');
  });

  it('uses the current palette and none of the old one', () => {
    for (const { html } of AUTH_TEMPLATES) {
      expect(html).toContain(EMAIL_COLORS.page);
      expect(html).toContain(EMAIL_COLORS.paperLight);
      // The cream-and-brown palette these templates used before ENG-32.
      for (const old of ['#E9DCC6', '#FFFCF6', '#241F1C', '#201E1D', '#F3E7D4', '#5E534A']) {
        expect(html).not.toContain(old);
      }
    }
  });
});

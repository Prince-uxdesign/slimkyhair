/**
 * Reusable email chrome: layout wrapper, header, footer, buttons, typography.
 * Mobile-first: single-column tables, fluid width up to 600px, >=48px tap
 * targets, no fixed-width content — designed for 320/360/390/430px first.
 */
import { COLORS, FONT_DISPLAY, FONT_SANS } from './tokens.ts';

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderButton({ href, label }: { href: string; label: string }): string {
  return `
    <table role="presentation" width="100%" style="margin: 0 auto;">
      <tr>
        <td align="center" style="padding: 4px 0 8px 0;">
          <a href="${href}" target="_blank" class="btn"
             style="display: inline-block; background-color: ${COLORS.ink}; color: ${COLORS.cream};
                    text-decoration: none; padding: 16px 28px; min-height: 20px; line-height: 20px;
                    font-family: ${FONT_SANS}; font-size: 15px; font-weight: 600; letter-spacing: 0.3px;
                    border-radius: 3px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

export function renderHeader(): string {
  return `
    <tr>
      <td class="header" style="background-color: ${COLORS.ink}; padding: 32px 24px; text-align: center;">
        <div style="color: ${COLORS.cream}; font-family: ${FONT_SANS}; font-size: 19px; letter-spacing: 3px;
                    font-weight: 600; text-transform: uppercase;">SLIMKY HAIR</div>
        <div style="color: #C5BCB3; font-family: ${FONT_SANS}; font-size: 11px; letter-spacing: 1.5px;
                    text-transform: uppercase; margin-top: 4px;">African Botanical Science</div>
      </td>
    </tr>`;
}

export function renderFooter(note?: string): string {
  return `
    <tr>
      <td class="footer" style="padding: 24px 20px; text-align: center; font-family: ${FONT_SANS};
                  font-size: 12px; line-height: 1.6; color: ${COLORS.muted}; border-top: 1px solid ${COLORS.border};">
        ${note ? `${escapeHtml(note)}<br>` : ''}
        © ${new Date().getFullYear()} Slimky Hair. All rights reserved.<br>
        Questions? Contact us at care@slimkyhair.com
      </td>
    </tr>`;
}

export function heading(text: string): string {
  return `<h1 style="font-family: ${FONT_DISPLAY}; font-size: 24px; font-weight: 700; margin: 0 0 14px 0; color: ${COLORS.ink};">${escapeHtml(text)}</h1>`;
}

export function paragraph(html: string): string {
  return `<p style="font-family: ${FONT_SANS}; font-size: 15px; line-height: 1.65; color: ${COLORS.inkSoft}; margin: 0 0 18px 0;">${html}</p>`;
}

export function badge(text: string): string {
  return `<span style="display: inline-block; background-color: ${COLORS.sageBg}; color: ${COLORS.sage};
             font-family: ${FONT_SANS}; font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 20px;
             margin-bottom: 16px; border: 1px solid ${COLORS.sageBorder};">${escapeHtml(text)}</span>`;
}

export function noticeBox(title: string, bodyHtml: string): string {
  return `
    <div class="notice-box" style="background-color: ${COLORS.cream}; border-left: 3px solid ${COLORS.alertBorder};
         padding: 14px 16px; font-family: ${FONT_SANS}; font-size: 13px; line-height: 1.6; color: ${COLORS.ink};
         margin-bottom: 24px; word-break: break-word;">
      <strong>${escapeHtml(title)}</strong><br>
      ${bodyHtml}
    </div>`;
}

const BASE_STYLES = `
  body { margin: 0; padding: 0; background-color: ${COLORS.cream}; -webkit-text-size-adjust: 100%; }
  table { border-spacing: 0; }
  td { padding: 0; }
  img { border: 0; max-width: 100%; }
  a { color: ${COLORS.ink}; }
  .wrapper { width: 100%; background-color: ${COLORS.cream}; padding: 32px 0; }
  .main-table { table-layout: fixed; background-color: ${COLORS.white}; margin: 0 auto; width: 100%; max-width: 600px;
                border: 1px solid ${COLORS.border}; border-radius: 4px; overflow: hidden; }
  .content { padding: 32px 28px; }
  .card { background-color: ${COLORS.cream}; border: 1px solid ${COLORS.border}; border-radius: 4px;
          padding: 20px; margin-bottom: 24px; }
  .items-table { width: 100%; border-collapse: collapse; margin-top: 12px; margin-bottom: 16px; }
  .items-table th { text-align: left; font-family: ${FONT_SANS}; font-size: 11px; text-transform: uppercase;
                     letter-spacing: 0.5px; color: ${COLORS.muted}; padding-bottom: 8px; border-bottom: 1px solid ${COLORS.border}; }
  .items-table td { padding: 10px 0; font-family: ${FONT_SANS}; font-size: 14px; border-bottom: 1px solid ${COLORS.borderSoft};
                     color: ${COLORS.ink}; vertical-align: top; word-break: break-word; }
  .order-number { font-family: 'SFMono-Regular', Consolas, monospace; font-weight: 600; word-break: break-all; overflow-wrap: anywhere; }
  .kv-table { table-layout: fixed; width: 100%; }

  /* Mobile-first breakpoints: 320px / 360px / 390px / 430px before desktop widths */
  @media only screen and (max-width: 480px) {
    .wrapper { padding: 16px 0 !important; }
    .content { padding: 24px 18px !important; }
    .header { padding: 26px 18px !important; }
    .footer { padding: 20px 16px !important; }
    .btn { display: block !important; width: 100% !important; box-sizing: border-box; text-align: center; }
    .items-table thead { display: none; }
    .items-table td { display: block; width: 100% !important; box-sizing: border-box; border-bottom: none; padding: 4px 0; text-align: left !important; }
    .items-table tr { display: block; padding: 12px 0; border-bottom: 1px solid ${COLORS.borderSoft}; }
    .items-table tr:last-child { border-bottom: none; }
    /* Key-value tables (order meta, quote/tracking facts): stack label above
       value instead of squeezing both into narrow fixed columns. Only tr/td
       are overridden to block (matching .items-table below) — forcing the
       <table> element itself to display:block causes a rendering engine
       quirk where it reverts to its intrinsic (colgroup-based) column
       widths instead of respecting width:100%. */
    .kv-table tr, .kv-table td { display: block !important; width: 100% !important; box-sizing: border-box; }
    .kv-table td { text-align: left !important; padding: 2px 0 !important; }
    .kv-table tr { padding-bottom: 10px; }
    .kv-table tr:last-child { padding-bottom: 0; }
  }
`;

export interface LayoutParams {
  title: string;
  previewText: string;
  bodyHtml: string;
}

/**
 * Wrap rendered content into the full HTML email document.
 * previewText becomes the hidden inbox-preview snippet.
 */
export function wrapEmailLayout({ title, previewText, bodyHtml }: LayoutParams): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&display=swap" rel="stylesheet">
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">${escapeHtml(previewText)}</div>
  <div class="wrapper">
    <table role="presentation" class="main-table" align="center" width="100%">
      ${renderHeader()}
      <tr>
        <td class="content">
          ${bodyHtml}
        </td>
      </tr>
      ${renderFooter()}
    </table>
  </div>
</body>
</html>`;
}

export { escapeHtml };

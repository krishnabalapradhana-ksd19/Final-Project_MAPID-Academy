const LOCALE = 'id-ID';

export const fmtNumber = (n, maximumFractionDigits = 0) =>
  Number(n).toLocaleString(LOCALE, { maximumFractionDigits });

export const fmtInt = (n) => fmtNumber(n, 0);
export const fmtHa = (n) => fmtNumber(n, 1);

export const fmtDistance = (m) =>
  m >= 1000 ? `${fmtNumber(m / 1000, 2)} km` : `${fmtNumber(m, 1)} m`;

export const fmtArea = (sqm) => {
  const ha = sqm / 10000;
  return ha >= 1 ? `${fmtNumber(ha, 2)} Ha` : `${fmtNumber(sqm, 1)} m²`;
};

export const fmtScale = (denominator) => `1 : ${fmtInt(Math.round(denominator))}`;

export const fmtDateId = (date = new Date()) =>
  date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });

export const fmtFileStamp = (date = new Date()) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('');

export const slugify = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'peta';

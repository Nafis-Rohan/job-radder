// Test helper: builds a tiny valid one-page PDF from plain ASCII lines (max ~50 lines).
export function makePdf(lines) {
  const escape = (text) => text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  const content = [
    'BT',
    '/F1 11 Tf',
    '14 TL',
    '50 800 Td',
    ...lines.map((line) => `(${escape(line)}) Tj T*`),
    'ET',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

export const SAMPLE_CV_LINES = [
  'Jane Example',
  'Senior Backend Engineer',
  'jane.example@mail.com | +880 1712-345678',
  'House 12, Road 5, Dhanmondi, Dhaka',
  '',
  'Summary',
  '6+ years of experience building REST APIs with Node.js, Express.js and PostgreSQL.',
  'Worked on a mobile banking and payment platform. Docker, Kubernetes, AWS, Redis.',
  '',
  'Experience',
  'Senior Backend Engineer, Pay Co   Jan 2021 - Present',
  'Backend Developer, Shop Ltd   2018 - 2020',
  '',
  'Education',
  'BSc in Computer Science, Example University   2014 - 2018',
];

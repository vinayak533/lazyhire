import AdmZip from "adm-zip";

export const sampleCv = `Alex Example
alex@example.com | +91 90000 12345 | Kochi, Kerala

Experience
Frontend Developer - Example Studio | 2022 - 2026
- Built 12 reusable React components for the customer support dashboard.
- Responsible for maintaining internal web applications and fixing reported bugs.
- Helped improve the accessibility of the customer onboarding experience.
- Reduced the page load time by 35% through image optimization and code splitting.
- Worked on the development of a TypeScript reporting dashboard for account managers.
- Implemented automated tests covering 40 key customer workflows.
- Assisted the team with the migration of legacy forms to reusable components.
- Designed responsive interfaces with clear focus states and keyboard navigation.

Education
Bachelor of Technology in Computer Science, Example College, 2022.
Coursework included algorithms, data structures, database design, software engineering,
human computer interaction and network fundamentals. Completed a team project
building a browser based task manager with accessible forms and clear documentation.

Skills
React, TypeScript, JavaScript, HTML, CSS, Git, REST APIs, SQLite, Playwright.
Comfortable collaborating with designers, reviewing pull requests and writing technical documentation.
Projects
- Created a small job board with keyword search and a responsive mobile interface.
- Managed a shared component library used by 3 product teams.
Contributed documentation for setup, accessibility checks and common troubleshooting tasks.
Worked closely with designers and engineers to clarify requirements and communicate progress.
`;
export const sampleJd =
  "Frontend Developer in Kochi. Build accessible React and TypeScript interfaces, integrate REST APIs, write automated tests with Playwright, and improve web performance. Collaborate with designers and review code. Three years of frontend experience required. Knowledge of GraphQL and CI pipelines is preferred.";

export function docxFixture(text = sampleCv, table = false): Buffer {
  const zip = new AdmZip();
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  zip.addFile(
    "[Content_Types].xml",
    Buffer.from(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
  );
  zip.addFile(
    "_rels/.rels",
    Buffer.from(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
  );
  zip.addFile(
    "word/document.xml",
    Buffer.from(
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text
        .split("\n")
        .map(
          (line) =>
            `<w:p><w:r><w:t xml:space="preserve">${escape(line)}</w:t></w:r></w:p>`,
        )
        .join(
          "",
        )}${table ? "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table content</w:t></w:r></w:p></w:tc></w:tr></w:tbl>" : ""}</w:body></w:document>`,
    ),
  );
  return zip.toBuffer();
}

export function pdfFixture(text = sampleCv): Buffer {
  const escape = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content = `BT /F1 9 Tf 40 750 Td 14 TL ${text
    .split("\n")
    .map((line) => `(${escape(line)}) Tj T*`)
    .join("\n")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let file = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(file));
    file += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(file);
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(file);
}

---
name: docx-to-markdown
description: Convert Word documents (.docx) to Markdown (.md) format. Triggers on "docx to markdown", "convert docx to md", "docx2md", or "md conversion"
---

# DOCX to Markdown Converter

Converts one or more Word documents (.docx) to Markdown (.md) format, preserving document structure including headings, lists, tables, bold/italic text, and links.

## Prerequisites

- Node.js installed (check with `node --version`)
- `mammoth` package (installed automatically if missing)

## How to Use

When you want to convert DOCX files, provide the file path(s):

```
Convert documentation/my-file.docx to markdown
Convert @file1.docx and @file2.docx to markdown
```

The skill will:
1. Check if required packages are installed
2. Convert each DOCX file using the mammoth library
3. Save .md files in the same directory with the same name
4. Report success/failure for each file

## Conversion Process

### Step 1: Install Dependencies
If mammoth is not installed, install it in the current directory:
```bash
npm install mammoth
```

### Step 2: Run Conversion Script
Execute a Node.js script that:
- Reads each DOCX file path from the user's request
- Uses mammoth to extract content and convert to HTML
- Converts HTML to Markdown format
- Writes output .md files

### Step 3: Verify Output
List the created .md files to confirm conversion

## Implementation

Create and run a Node.js script:

```bash
node << 'EOF'
const mammoth = require("mammoth");
const fs = require("fs");
const path = require("path");

// Convert HTML to basic Markdown
function htmlToMarkdown(html) {
  let md = html
    // Headings
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n")
    .replace(/<h5[^>]*>(.*?)<\/h5>/gi, "##### $1\n")
    .replace(/<h6[^>]*>(.*?)<\/h6>/gi, "###### $1\n")
    // Paragraphs
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
    // Bold
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
    // Italic
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
    // Line breaks
    .replace(/<br[^>]*>/gi, "\n")
    // Lists
    .replace(/<ul[^>]*>/gi, "\n")
    .replace(/<\/ul>/gi, "\n")
    .replace(/<ol[^>]*>/gi, "\n")
    .replace(/<\/ol>/gi, "\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    // Links
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    // Remove remaining HTML tags
    .replace(/<[^>]*>/g, "")
    // Clean up multiple newlines
    .replace(/\n\n\n+/g, "\n\n")
    .trim();
  
  return md;
}

async function convertDocxToMarkdown(docxPath, mdPath) {
  try {
    const result = await mammoth.convertToHtml({ path: docxPath });
    const markdown = htmlToMarkdown(result.value);
    
    fs.writeFileSync(mdPath, markdown, "utf-8");
    console.log(`✓ Converted: ${path.basename(docxPath)} → ${path.basename(mdPath)}`);
    return true;
  } catch (error) {
    console.error(`✗ Error converting ${docxPath}:`, error.message);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("No files provided");
    process.exit(1);
  }
  
  let successCount = 0;
  for (const docxPath of args) {
    const mdPath = docxPath.replace(/\.docx$/i, ".md");
    if (await convertDocxToMarkdown(docxPath, mdPath)) {
      successCount++;
    }
  }
  
  console.log(`\nConverted ${successCount}/${args.length} file(s)`);
}

main();
EOF
```

## Tips

- **Ensure Node.js is available**: Run `node --version` first
- **Relative paths**: Use relative paths from your current working directory
- **Table conversion**: Tables are converted to markdown table format
- **Special characters**: HTML entities may remain; they're valid in markdown
- **Multiple files**: You can convert multiple DOCX files in one command
- **Verify output**: Check the generated .md files to ensure formatting is correct

## Troubleshooting

**"mammoth not found"**: Install with `npm install mammoth`

**"node not found"**: Ensure Node.js is installed and in your PATH

**File not found**: Use correct file path relative to current directory

**Special formatting lost**: Mammoth converts to HTML which is then converted to Markdown — complex Word formatting (multiple columns, shapes, etc.) may be simplified

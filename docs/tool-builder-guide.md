# MDX Tool Builder Guide

This guide is for developers building tools that work with MDX files: converters, validators, linters, search indexers, and other utilities.

## Tool Categories

| Category | Examples | Key Concerns |
|----------|----------|--------------|
| **Converters** | DOCX→MDX, MDX→PDF, MDX→HTML | Fidelity, asset handling, metadata mapping |
| **Validators** | Schema checkers, linters | Spec compliance, clear error messages |
| **Indexers** | Search engines, catalogers | Metadata extraction, content parsing |
| **Analyzers** | Word counters, link checkers | Content traversal, asset verification |
| **Diff Tools** | Version comparers | Text extraction, structural comparison |

---

## Converters

### Importing to MDX

When converting other formats to MDX:

#### From Markdown + Images

```python
def markdown_folder_to_mdx(folder_path, output_path):
    """Convert a folder with markdown and images to MDX."""
    md_file = find_main_markdown(folder_path)
    content = read_file(md_file)

    # Find all image references
    images = extract_image_refs(content)

    # Rewrite paths to MDX structure
    for old_path, new_path in images:
        content = content.replace(old_path, f"assets/images/{new_path}")

    # Build MDX
    write_mdx(output_path, title_from_content(content), content,
              [(f"{folder_path}/{old}", f"assets/images/{new}", guess_mime(old))
               for old, new in images])
```

#### From DOCX

Key mappings:
- **Headings**: `<w:pStyle w:val="Heading1">` → `# Heading`
- **Bold/Italic**: `<w:b/>`, `<w:i/>` → `**bold**`, `*italic*`
- **Images**: Extract from `word/media/` → `assets/images/`
- **Tables**: `<w:tbl>` → Markdown tables
- **Document Properties**: `docProps/core.xml` → manifest metadata

```python
def docx_to_mdx(docx_path, output_path):
    with zipfile.ZipFile(docx_path, 'r') as docx:
        # Extract document.xml for content
        doc_xml = docx.read('word/document.xml')
        content = convert_docx_xml_to_markdown(doc_xml)

        # Extract media files
        assets = []
        for name in docx.namelist():
            if name.startswith('word/media/'):
                filename = os.path.basename(name)
                assets.append((name, f'assets/images/{filename}'))

        # Extract metadata from core.xml
        core_xml = docx.read('docProps/core.xml')
        metadata = parse_docx_metadata(core_xml)

    # Create MDX with extracted content and assets
    create_mdx(output_path, content, assets, metadata)
```

#### From HTML

- Use a Markdown converter (Turndown, html2text, pandoc)
- Download and embed external images
- Convert `<video>`, `<audio>` to extended directives
- Extract `<title>`, `<meta>` for manifest

### Exporting from MDX

#### To HTML

```python
def mdx_to_html(mdx_path, output_folder):
    doc = read_mdx(mdx_path)

    # Convert markdown to HTML
    html_content = markdown_to_html(doc['content'])

    # Extract assets to output folder
    for asset_path, asset_data in doc['assets'].items():
        write_file(f"{output_folder}/{asset_path}", asset_data)

    # Generate index.html with asset references
    html = f"""<!DOCTYPE html>
<html lang="{doc['manifest']['document'].get('language', 'en')}">
<head>
    <meta charset="UTF-8">
    <title>{doc['manifest']['document']['title']}</title>
</head>
<body>
{html_content}
</body>
</html>"""
    write_file(f"{output_folder}/index.html", html)
```

#### To PDF

Options:
1. **Via HTML**: MDX → HTML → PDF (using wkhtmltopdf, Puppeteer, weasyprint)
2. **Direct**: Use a Markdown-to-PDF library with custom asset resolver

```python
def mdx_to_pdf(mdx_path, output_path):
    doc = read_mdx(mdx_path)

    # Create temp directory with extracted assets
    with tempfile.TemporaryDirectory() as tmpdir:
        for asset_path, asset_data in doc['assets'].items():
            write_file(f"{tmpdir}/{asset_path}", asset_data)

        # Render markdown to PDF with asset base path
        render_markdown_to_pdf(
            doc['content'],
            output_path,
            asset_base=tmpdir
        )
```

---

## Validators

### Schema Validation

Validate manifest against the JSON schema:

```python
import jsonschema

MDX_MANIFEST_SCHEMA = {
    "type": "object",
    "required": ["mdx_version", "document", "content"],
    "properties": {
        "mdx_version": {"type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$"},
        "document": {
            "type": "object",
            "required": ["id", "title", "created", "modified"],
            "properties": {
                "id": {"type": "string", "format": "uuid"},
                "title": {"type": "string", "minLength": 1},
                "created": {"type": "string", "format": "date-time"},
                "modified": {"type": "string", "format": "date-time"}
            }
        },
        "content": {
            "type": "object",
            "properties": {
                "entry_point": {"type": "string", "default": "document.md"}
            }
        }
    }
}

def validate_manifest(manifest):
    jsonschema.validate(manifest, MDX_MANIFEST_SCHEMA)
```

### Structural Validation

```python
def validate_structure(mdx_path):
    issues = []

    with zipfile.ZipFile(mdx_path, 'r') as mdx:
        names = set(mdx.namelist())

        # Required files
        if 'manifest.json' not in names:
            issues.append(('error', 'Missing manifest.json'))
            return issues

        manifest = json.loads(mdx.read('manifest.json'))
        entry = manifest.get('content', {}).get('entry_point', 'document.md')

        if entry not in names:
            issues.append(('error', f'Missing entry point: {entry}'))

        # Asset integrity
        for asset in manifest.get('assets', []):
            path = asset['path']
            if path not in names:
                issues.append(('error', f'Missing asset: {path}'))
            elif 'hash' in asset:
                actual_hash = hash_file(mdx.read(path))
                if actual_hash != asset['hash']:
                    issues.append(('error', f'Hash mismatch: {path}'))

        # Path conventions
        for name in names:
            if '\\' in name:
                issues.append(('warning', f'Backslash in path: {name}'))
            if len(name) > 255:
                issues.append(('warning', f'Path too long: {name}'))

    return issues
```

### Content Validation

```python
def validate_content(mdx_path):
    issues = []
    doc = read_mdx(mdx_path)

    # Check for broken asset references
    referenced = extract_asset_references(doc['content'])
    available = set(doc['assets'].keys())

    for ref in referenced:
        if ref not in available:
            issues.append(('warning', f'Broken reference: {ref}'))

    # Check for unreferenced assets
    for asset in available:
        if asset not in referenced:
            issues.append(('info', f'Unreferenced asset: {asset}'))

    return issues
```

---

## Indexers & Catalogers

### Metadata Extraction

For search indexing or catalog building:

```python
def extract_metadata(mdx_path):
    """Extract searchable metadata from MDX file."""
    with zipfile.ZipFile(mdx_path, 'r') as mdx:
        manifest = json.loads(mdx.read('manifest.json'))
        doc = manifest['document']

        # Get content for full-text search
        entry = manifest.get('content', {}).get('entry_point', 'document.md')
        content = mdx.read(entry).decode('utf-8')

        # Extract plain text (strip markdown)
        plain_text = strip_markdown(content)

        return {
            'id': doc['id'],
            'title': doc['title'],
            'description': doc.get('description', ''),
            'authors': [a['name'] for a in doc.get('authors', [])],
            'keywords': doc.get('keywords', []),
            'language': doc.get('language', 'en'),
            'created': doc['created'],
            'modified': doc['modified'],
            'word_count': len(plain_text.split()),
            'full_text': plain_text,
            'file_path': mdx_path,
            'file_size': os.path.getsize(mdx_path)
        }
```

### Batch Processing

```python
def index_mdx_folder(folder_path, index):
    """Index all MDX files in a folder."""
    for root, dirs, files in os.walk(folder_path):
        for file in files:
            if file.endswith('.mdx'):
                path = os.path.join(root, file)
                try:
                    metadata = extract_metadata(path)
                    index.add(metadata)
                except Exception as e:
                    log.warning(f"Failed to index {path}: {e}")
```

---

## Analyzers

### Link Checker

```python
def check_links(mdx_path):
    """Check all links in an MDX document."""
    doc = read_mdx(mdx_path)
    results = []

    # Extract all links
    links = re.findall(r'\[([^\]]+)\]\(([^)]+)\)', doc['content'])

    for text, url in links:
        if url.startswith('http://') or url.startswith('https://'):
            # External link - check reachability
            try:
                response = requests.head(url, timeout=5)
                if response.status_code >= 400:
                    results.append(('broken', url, response.status_code))
                else:
                    results.append(('ok', url, response.status_code))
            except requests.RequestException as e:
                results.append(('error', url, str(e)))
        else:
            # Internal link - check if asset exists
            if url in doc['assets']:
                results.append(('ok', url, 'asset'))
            else:
                results.append(('broken', url, 'not found'))

    return results
```

### Statistics Generator

```python
def analyze_mdx(mdx_path):
    """Generate statistics for an MDX document."""
    doc = read_mdx(mdx_path)
    content = doc['content']

    # Text stats
    words = len(content.split())
    chars = len(content)
    lines = content.count('\n') + 1

    # Structure stats
    headings = len(re.findall(r'^#{1,6}\s', content, re.MULTILINE))
    links = len(re.findall(r'\[([^\]]+)\]\(([^)]+)\)', content))
    images = len(re.findall(r'!\[([^\]]*)\]\(([^)]+)\)', content))
    code_blocks = len(re.findall(r'```', content)) // 2

    # Asset stats
    total_asset_size = sum(len(data) for data in doc['assets'].values())
    asset_count = len(doc['assets'])

    return {
        'words': words,
        'characters': chars,
        'lines': lines,
        'headings': headings,
        'links': links,
        'images': images,
        'code_blocks': code_blocks,
        'assets': asset_count,
        'total_asset_size': total_asset_size,
        'reading_time_minutes': words // 200  # ~200 wpm
    }
```

---

## Diff Tools

### Content Comparison

```python
import difflib

def diff_mdx(path1, path2):
    """Compare two MDX documents."""
    doc1 = read_mdx(path1)
    doc2 = read_mdx(path2)

    # Content diff
    content_diff = list(difflib.unified_diff(
        doc1['content'].splitlines(keepends=True),
        doc2['content'].splitlines(keepends=True),
        fromfile=path1,
        tofile=path2
    ))

    # Metadata diff
    meta_changes = compare_dicts(
        doc1['manifest']['document'],
        doc2['manifest']['document']
    )

    # Asset diff
    assets1 = set(doc1['assets'].keys())
    assets2 = set(doc2['assets'].keys())

    return {
        'content_diff': ''.join(content_diff),
        'metadata_changes': meta_changes,
        'added_assets': assets2 - assets1,
        'removed_assets': assets1 - assets2,
        'common_assets': assets1 & assets2
    }
```

---

## CLI Tool Patterns

### Command Structure

Follow the pattern used by the reference CLI:

```
mdx <command> [options] <file>

Commands:
  view      Open document in browser
  extract   Extract archive contents
  info      Display document information
  validate  Check document validity
  convert   Convert to/from other formats
```

### Progress Reporting

For long operations:

```python
def convert_with_progress(input_path, output_path):
    steps = [
        ('Reading source', read_source),
        ('Converting content', convert_content),
        ('Processing assets', process_assets),
        ('Writing output', write_output)
    ]

    for i, (label, func) in enumerate(steps):
        print(f"[{i+1}/{len(steps)}] {label}...")
        func()

    print("Done!")
```

### Error Handling

```python
def main():
    try:
        result = process_mdx(args.file)
        print(json.dumps(result, indent=2))
        return 0
    except FileNotFoundError:
        print(f"Error: File not found: {args.file}", file=sys.stderr)
        return 1
    except zipfile.BadZipFile:
        print(f"Error: Not a valid ZIP/MDX file: {args.file}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as e:
        print(f"Error: Invalid manifest JSON: {e}", file=sys.stderr)
        return 1
    except MDXValidationError as e:
        print(f"Validation error: {e}", file=sys.stderr)
        return 2
```

---

## Best Practices

### Performance

1. **Stream large files** - Don't load entire archives into memory
2. **Lazy asset loading** - Only extract assets when needed
3. **Cache manifest** - Parse once, reuse for multiple operations
4. **Parallel processing** - Process multiple files concurrently

### Robustness

1. **Handle malformed input** - Graceful degradation over crashes
2. **Validate early** - Check structure before processing
3. **Preserve originals** - Never modify input files in place
4. **Atomic writes** - Write to temp file, then rename

### User Experience

1. **Clear error messages** - Include file paths and line numbers
2. **Progress indicators** - For operations over 1 second
3. **Dry-run modes** - Let users preview changes
4. **Verbose/quiet flags** - Adjustable output levels

---

## Reference

- [Implementation Guide](implementation-guide.md) - For building readers/writers
- [Format Internals](format-internals.md) - Deep technical details
- [Full Specification](../spec/MDX_FORMAT_SPECIFICATION.md) - Authoritative reference

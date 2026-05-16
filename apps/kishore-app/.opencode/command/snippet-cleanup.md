---
description: Clean up code snippet naming and fix broken references in MDX files
agent: general
subtask: true
---

Clean up the code snippet naming in `src/components/code-block/snippets/` folder and ensure proper references in MDX files.

## Current Structure Analysis

Analyze these files:
!`ls -la src/components/code-block/snippets/`

Find all CodeBlock references in MDX files:
!`find src/content -name "*.mdx" -exec grep -l "CodeBlock" {} \;`

Extract all CodeBlock IDs currently referenced:
!`find src/content -name "*.mdx" -exec grep -o 'id="[^"]*"' {} \; | sort | uniq`

## Your Task

1. **Analyze current snippet files** for naming consistency following these standards:
   - Use kebab-case with descriptive names (e.g., `effect-all-concurrent`, `effect-error-handling`)
   - All Effect-related snippets should start with `effect-`
   - Use full words, no abbreviations (e.g., `concurrent` not `conc`)
   - Names should clearly indicate functionality being demonstrated

2. **Scan all MDX files** in `src/content/` for `<CodeBlock id="..." />` references and identify:
   - Broken references (MDX references non-existent snippet files)
   - Orphaned snippets (snippet files not referenced in any MDX)
   - Inconsistent naming patterns

3. **Create a rename plan** that includes:
   - Current filename → Proposed filename mapping
   - List of MDX files that need ID updates
   - Clear reasoning for each rename

4. **Execute the cleanup safely**:
   - Rename snippet files using `mv` commands
   - Update MDX references using `sed` or direct file editing
   - Only change `<CodeBlock id="old-name" />` to `<CodeBlock id="new-name" />`

5. **Verify integrity** after changes:
   - Confirm all CodeBlock references point to existing snippet files
   - Ensure the auto-import system in `index.ts` still works

## Safety Requirements

- **NEVER modify** the actual TypeScript code content in snippet files
- **NEVER modify** MDX content except for CodeBlock ID references
- **ALWAYS preserve** the functionality of the auto-import glob system in `src/components/code-block/snippets/index.ts`
- **VALIDATE** all references work after making changes
- **PROVIDE** a summary of all changes made

Focus on reducing broken references and improving naming consistency without touching any code content.

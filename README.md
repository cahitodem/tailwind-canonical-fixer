# Tailwind CSS Canonical & Arbitrary Fixer

VS Code extension to automatically detect and convert arbitrary Tailwind pixel values and legacy syntax into modern, canonical Tailwind CSS classes.

---

## Features

- **Arbitrary Spacing to Canonical**: Converts 4px-divisible arbitrary values (e.g., `min-w-[500px]` $\rightarrow$ `min-w-125`, `p-[16px]` $\rightarrow$ `p-4`, `-top-[16px]` $\rightarrow$ `-top-4`).
- **Border Radius**: Converts arbitrary radius values (e.g., `rounded-[32px]` $\rightarrow$ `rounded-4xl`, `rounded-[16px]` $\rightarrow$ `rounded-2xl`, `rounded-[0px]` $\rightarrow$ `rounded-none`, `rounded-[9999px]` $\rightarrow$ `rounded-full`).
- **Border Width**: Converts arbitrary border widths (e.g., `border-[1px]` $\rightarrow$ `border`, `border-[2px]` $\rightarrow$ `border-2`, `border-[0px]` $\rightarrow$ `border-0`).
- **Tailwind v4 Canonicals**:
  - Linear/Radial/Conic gradients (`bg-gradient-to-br` $\rightarrow$ `bg-linear-to-br`, `bg-gradient-radial` $\rightarrow$ `bg-radial`, `bg-gradient-conic` $\rightarrow$ `bg-conic`).
  - Negative zero normalization (`-z-0` $\rightarrow$ `z-0`, `-m-0` $\rightarrow$ `m-0`).
  - Stroke width (`stroke-[3]` $\rightarrow$ `stroke-3`).
  - Leading zero (`leading-[0]` $\rightarrow$ `leading-0`).
  - Flexbox aliases (`flex-grow` $\rightarrow$ `grow`, `flex-shrink` $\rightarrow$ `shrink`).
  - Text ellipsis (`overflow-ellipsis` $\rightarrow$ `text-ellipsis`).
  - Shadow updates (`shadow-sm` $\rightarrow$ `shadow-xs`).
  - Duplicate background opacity cleanup (`bg-soft-bg bg-soft-bg/95` $\rightarrow$ `bg-soft-bg/95`).
- **Quick Fix Lightbulb**: Instant single-click fix right at your cursor.
- **Save on Edit (Format on Save)**: Auto-fix on save with `editor.codeActionsOnSave`.
- **Command Palette Commands**:
  - `Tailwind Fixer: Fix All Canonical Issues in Current File`
  - `Tailwind Fixer: Fix Entire Workspace`

---

## Configuration Settings

| Setting | Default | Description |
|---|---|---|
| `tailwindFixer.enable` | `true` | Enables or disables all analysis and fixing capabilities. |
| `tailwindFixer.tailwindVersion` | `"auto"` | Target Tailwind version (`"auto"`, `"v4"`, `"v3"`). When set to `"auto"`, it detects from your `tailwind.config.*` and `package.json`. |
| `tailwindFixer.convertArbitraryPx` | `true` | Converts 4px-divisible arbitrary pixel values to standard Tailwind spacing units (e.g., `min-w-[500px]` -> `min-w-125`, `w-[16px]` -> `w-4`). |
| `tailwindFixer.convertBorderRadius` | `true` | Converts arbitrary corner radius values according to the target Tailwind version scale. |
| `tailwindFixer.convertV4Canonicals` | `true` | Converts Tailwind v4 canonical classes (`bg-linear`, `stroke-3`, `leading-0`, `z-0`, etc.). |
| `tailwindFixer.convertShadowSmToXs` | `false` | Converts `shadow-sm` to `shadow-xs` during Tailwind v3 to v4 migration. Default is `false` as `shadow-sm` is a valid utility. |
| `tailwindFixer.exclude` | `["**/node_modules/**", "**/.next/**", ...]` | Glob patterns to exclude when scanning the workspace and analyzing diagnostics. |

---

## Auto Fix on Save (`Ctrl+S`)

Add the following to your VS Code user or workspace `settings.json`:

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.tailwindCanonical": "always"
  }
}
```

---

## Building and Packaging

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile TypeScript:
   ```bash
   npm run compile
   ```

3. Run Tests:
   ```bash
   npm test
   ```

4. Package as `.vsix`:
   ```bash
   npx @vscode/vsce package
   ```

5. Install into VS Code:
   ```bash
   code --install-extension tailwind-canonical-fixer-1.0.0.vsix
   ```

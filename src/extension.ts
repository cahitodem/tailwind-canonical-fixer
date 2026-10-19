import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { scanDocumentForFixes, RuleOptions, TailwindTargetVersion } from './rules';

const DIAGNOSTIC_SOURCE = 'tailwind-canonical';
const CODE_ACTION_KIND_FIX_ALL = vscode.CodeActionKind.SourceFixAll.append('tailwindCanonical');

const SUPPORTED_LANGUAGES = new Set([
  'typescriptreact',
  'javascriptreact',
  'typescript',
  'javascript',
  'html',
  'vue',
  'svelte',
  'astro',
  'php',
  'blade'
]);

const BUILTIN_EXCLUDE_FRAGMENTS = [
  '/.next/',
  '/node_modules/',
  '/.turbo/',
  '/.nuxt/',
  '/.output/',
  '/dist/',
  '/dist-ssr/',
  '/build/',
  '/out/',
  '/coverage/',
  '/.git/',
  '/.cache/',
  '/.vscode/',
  '/.vscode-test/',
  '/tmp/',
  '/temp/'
];

function shouldProcessDocument(
  document: vscode.TextDocument,
  options: RuleOptions & { enable: boolean; exclude: string[] }
): boolean {
  if (!options.enable) return false;
  if (document.uri.scheme !== 'file') return false;
  if (!SUPPORTED_LANGUAGES.has(document.languageId)) return false;

  const fileName = document.fileName;
  if (fileName.endsWith('.d.ts')) return false;

  const normalizedPath = document.uri.fsPath.replace(/\\/g, '/');

  // 1. Yerleşik geçici ve derleme dizinlerini yoksay (.next, node_modules, dist vb.)
  for (const fragment of BUILTIN_EXCLUDE_FRAGMENTS) {
    if (normalizedPath.includes(fragment)) {
      return false;
    }
  }

  // 2. Minified veya chunk dosyalarını yoksay
  if (/\.(min|chunk|bundle)\.js$/i.test(normalizedPath) || /\/_next\//.test(normalizedPath)) {
    return false;
  }

  // 3. Kullanıcı exclude ayarlarını kontrol et
  for (const pattern of options.exclude) {
    const cleanPattern = pattern
      .replace(/^\*\*\//, '')
      .replace(/\/\*\*$/, '')
      .replace(/\\/g, '/');
    if (cleanPattern && normalizedPath.includes(cleanPattern)) {
      return false;
    }
  }

  return true;
}

function detectTailwindVersion(folderUri?: vscode.Uri): TailwindTargetVersion {
  const config = vscode.workspace.getConfiguration('tailwindFixer');
  const userVersion = config.get<string>('tailwindVersion', 'auto');
  if (userVersion === 'v3' || userVersion === 'v4') {
    return userVersion;
  }

  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    const rootPath = folderUri
      ? vscode.workspace.getWorkspaceFolder(folderUri)?.uri.fsPath
      : vscode.workspace.workspaceFolders[0].uri.fsPath;

    if (rootPath) {
      try {
        const pkgPath = path.join(rootPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          const twDep = pkg.dependencies?.tailwindcss || pkg.devDependencies?.tailwindcss;
          if (typeof twDep === 'string') {
            if (twDep.includes('^4') || twDep.includes('~4') || twDep.startsWith('4')) {
              return 'v4';
            }
            if (twDep.includes('^3') || twDep.includes('~3') || twDep.startsWith('3')) {
              return 'v3';
            }
          }
        }

        const configFiles = ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs', 'tailwind.config.mjs'];
        for (const cf of configFiles) {
          if (fs.existsSync(path.join(rootPath, cf))) {
            return 'v3';
          }
        }
      } catch {
        // Hata durumunda varsayılan olarak v4 kabul et
      }
    }
  }

  return 'v4';
}

function getDiagnosticSeverity(): vscode.DiagnosticSeverity {
  const config = vscode.workspace.getConfiguration('tailwindFixer');
  const level = config.get<string>('diagnosticSeverity', 'information');
  switch (level) {
    case 'hint':
      return vscode.DiagnosticSeverity.Hint;
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    case 'information':
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('tailwindCanonical');
  context.subscriptions.push(diagnosticCollection);

  // Dosya bazlı debounce yönetimi (tek bir global timeout yerine her dosyanın kendi zamanlayıcısı)
  const fileDebounceTimeouts = new Map<string, NodeJS.Timeout>();

  // 1. Ayarları Oku
  function getOptions(docUri?: vscode.Uri): RuleOptions & {
    enable: boolean;
    exclude: string[];
    onlyActiveDocument: boolean;
    autoSaveOnWorkspaceFix: boolean;
  } {
    const config = vscode.workspace.getConfiguration('tailwindFixer');
    const detectedVersion = detectTailwindVersion(docUri);

    return {
      enable: config.get<boolean>('enable', true),
      convertArbitraryPx: config.get<boolean>('convertArbitraryPx', true),
      convertBorderRadius: config.get<boolean>('convertBorderRadius', true),
      convertV4Canonicals: config.get<boolean>('convertV4Canonicals', true),
      convertShadowSmToXs: config.get<boolean>('convertShadowSmToXs', false),
      onlyActiveDocument: config.get<boolean>('onlyActiveDocument', false),
      autoSaveOnWorkspaceFix: config.get<boolean>('autoSaveOnWorkspaceFix', true),
      tailwindVersion: detectedVersion,
      exclude: config.get<string[]>('exclude', [
        '**/node_modules/**',
        '**/.next/**',
        '**/.turbo/**',
        '**/.nuxt/**',
        '**/.output/**',
        '**/dist/**',
        '**/dist-ssr/**',
        '**/build/**',
        '**/out/**',
        '**/coverage/**',
        '**/.git/**'
      ])
    };
  }

  // 2. Teşhis (Diagnostic) Güncelleme
  function updateDiagnostics(document: vscode.TextDocument) {
    const options = getOptions(document.uri);
    if (!shouldProcessDocument(document, options)) {
      diagnosticCollection.delete(document.uri);
      return;
    }

    // Yalnızca aktif belge modu açıksa ve bu dosya aktif değilse temizle
    if (options.onlyActiveDocument) {
      const activeUri = vscode.window.activeTextEditor?.document.uri.toString();
      if (document.uri.toString() !== activeUri) {
        diagnosticCollection.delete(document.uri);
        return;
      }
    }

    const text = document.getText();
    const matches = scanDocumentForFixes(text, options);

    if (matches.length === 0) {
      diagnosticCollection.delete(document.uri);
      return;
    }

    const severity = getDiagnosticSeverity();
    const diagnostics: vscode.Diagnostic[] = matches.map((item) => {
      const range = new vscode.Range(
        document.positionAt(item.startOffset),
        document.positionAt(item.endOffset)
      );

      const diagnostic = new vscode.Diagnostic(range, item.message, severity);
      diagnostic.source = DIAGNOSTIC_SOURCE;
      diagnostic.code = item.ruleName;
      return diagnostic;
    });

    diagnosticCollection.set(document.uri, diagnostics);
  }

  // Dosya bazlı bağımsız debounce mekanizması
  function triggerUpdateDiagnostics(document: vscode.TextDocument) {
    const uriKey = document.uri.toString();
    const existing = fileDebounceTimeouts.get(uriKey);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      fileDebounceTimeouts.delete(uriKey);
      updateDiagnostics(document);
    }, 200);

    fileDebounceTimeouts.set(uriKey, timer);
  }

  // Doküman Olayları
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      const options = getOptions(doc.uri);
      if (shouldProcessDocument(doc, options)) {
        updateDiagnostics(doc);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => triggerUpdateDiagnostics(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      const uriKey = doc.uri.toString();
      const existing = fileDebounceTimeouts.get(uriKey);
      if (existing) {
        clearTimeout(existing);
        fileDebounceTimeouts.delete(uriKey);
      }
      diagnosticCollection.delete(doc.uri);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      const options = getOptions();
      if (options.onlyActiveDocument) {
        // Aktif olmayan tüm belgelerin teşhislerini temizle
        diagnosticCollection.clear();
      }
      if (editor) {
        updateDiagnostics(editor.document);
      }
    }),
    vscode.workspace.onDidChangeConfiguration(() => {
      vscode.workspace.textDocuments.forEach((doc) => updateDiagnostics(doc));
    })
  );

  // Açık tüm editörleri tara
  if (vscode.window.activeTextEditor) {
    updateDiagnostics(vscode.window.activeTextEditor.document);
  }

  // 3. Code Actions Provider (Quick Fix & Source Fix All)
  const codeActionProvider: vscode.CodeActionProvider = {
    provideCodeActions(document, range, context) {
      const options = getOptions(document.uri);
      if (!shouldProcessDocument(document, options)) return [];

      const actions: vscode.CodeAction[] = [];
      const text = document.getText();
      const allMatches = scanDocumentForFixes(text, options);
      if (allMatches.length === 0) return [];

      // İmleç veya teşhis ile kesişen eşleşmeleri bul
      const cursorMatches = allMatches.filter((item) => {
        const itemRange = new vscode.Range(
          document.positionAt(item.startOffset),
          document.positionAt(item.endOffset)
        );

        if (itemRange.intersection(range) || itemRange.contains(range.start) || itemRange.contains(range.end)) {
          return true;
        }

        return context.diagnostics.some(
          (d) => d.source === DIAGNOSTIC_SOURCE && itemRange.intersection(d.range)
        );
      });

      // A. Tekil Quick Fix (Doğrulanmış kesin ofset ile)
      for (const match of cursorMatches) {
        const matchRange = new vscode.Range(
          document.positionAt(match.startOffset),
          document.positionAt(match.endOffset)
        );

        // Güvenlik doğrulaması: Seçilen aralığın metninin orijinal metinle birebir eşleştiğinden emin ol
        if (document.getText(matchRange) !== match.originalText) {
          continue;
        }

        const fixAction = new vscode.CodeAction(
          `Tailwind: Replace '${match.originalText}' with '${match.replacementText}'`,
          vscode.CodeActionKind.QuickFix
        );
        fixAction.edit = new vscode.WorkspaceEdit();
        fixAction.edit.replace(document.uri, matchRange, match.replacementText);
        fixAction.isPreferred = true;
        actions.push(fixAction);
      }

      // B. Toplu Düzeltme (Hem Quick Fix menüsünde hem Kaydetmede devreye girer)
      const isFixAllRequested =
        context.only?.contains(vscode.CodeActionKind.SourceFixAll) ||
        context.only?.contains(CODE_ACTION_KIND_FIX_ALL);

      if (cursorMatches.length > 0 || isFixAllRequested) {
        const fixAllAction = new vscode.CodeAction(
          `Tailwind: Fix all ${allMatches.length} canonical issues in this file`,
          isFixAllRequested ? CODE_ACTION_KIND_FIX_ALL : vscode.CodeActionKind.QuickFix
        );
        fixAllAction.edit = new vscode.WorkspaceEdit();

        // Ofset kaymasını önlemek için tersten (son karakterden başa) değiştir
        const sortedDesc = [...allMatches].sort((a, b) => b.startOffset - a.startOffset);
        for (const item of sortedDesc) {
          const itemRange = new vscode.Range(
            document.positionAt(item.startOffset),
            document.positionAt(item.endOffset)
          );
          if (document.getText(itemRange) === item.originalText) {
            fixAllAction.edit.replace(document.uri, itemRange, item.replacementText);
          }
        }

        actions.push(fixAllAction);
      }

      return actions;
    }
  };

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [
        { scheme: 'file', language: 'typescriptreact' },
        { scheme: 'file', language: 'javascriptreact' },
        { scheme: 'file', language: 'typescript' },
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'html' },
        { scheme: 'file', language: 'vue' },
        { scheme: 'file', language: 'svelte' },
        { scheme: 'file', language: 'astro' }
      ],
      codeActionProvider,
      {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, CODE_ACTION_KIND_FIX_ALL]
      }
    )
  );

  // 4. Command Palette: Aktif Dosyayı Düzelt
  const fixCurrentFileCmd = vscode.commands.registerCommand(
    'tailwindFixer.fixCurrentFile',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('Aktif bir dosya bulunamadı.');
        return;
      }

      const document = editor.document;
      const options = getOptions(document.uri);
      if (!shouldProcessDocument(document, options)) {
        vscode.window.showWarningMessage('Bu dosya Tailwind Fixer tarafından işlenmeye uygun değil veya hariç tutulmuş.');
        return;
      }

      const matches = scanDocumentForFixes(document.getText(), options);
      if (matches.length === 0) {
        vscode.window.showInformationMessage('Dönüştürülecek Tailwind sınıfı bulunamadı.');
        return;
      }

      const edit = new vscode.WorkspaceEdit();
      const sortedDesc = [...matches].sort((a, b) => b.startOffset - a.startOffset);
      let appliedCount = 0;

      for (const item of sortedDesc) {
        const itemRange = new vscode.Range(
          document.positionAt(item.startOffset),
          document.positionAt(item.endOffset)
        );
        if (document.getText(itemRange) === item.originalText) {
          edit.replace(document.uri, itemRange, item.replacementText);
          appliedCount++;
        }
      }

      if (appliedCount > 0) {
        await vscode.workspace.applyEdit(edit);
        updateDiagnostics(document);
        vscode.window.showInformationMessage(`✓ ${appliedCount} adet Tailwind sınıfı düzeltildi.`);
      }
    }
  );

  // 5. Command Palette: Tüm Workspace'i Düzelt
  const fixWorkspaceCmd = vscode.commands.registerCommand(
    'tailwindFixer.fixWorkspace',
    async () => {
      const options = getOptions();
      const includePattern = '**/*.{tsx,ts,jsx,js,html,vue,svelte,astro}';
      const excludePattern = `{${options.exclude.join(',')}}`;

      const files = await vscode.workspace.findFiles(includePattern, excludePattern);
      const eligibleFiles: vscode.Uri[] = [];

      for (const uri of files) {
        const normalized = uri.fsPath.replace(/\\/g, '/');
        let isExcluded = false;
        for (const frag of BUILTIN_EXCLUDE_FRAGMENTS) {
          if (normalized.includes(frag)) {
            isExcluded = true;
            break;
          }
        }
        if (!isExcluded && !/\.(min|chunk|bundle)\.js$/i.test(normalized) && !normalized.endsWith('.d.ts')) {
          eligibleFiles.push(uri);
        }
      }

      if (eligibleFiles.length === 0) {
        vscode.window.showInformationMessage('Dönüştürülecek uygun dosya bulunamadı.');
        return;
      }

      // Kullanıcının önceden açık olan sekmelerini kaydet (daha sonra geçici açılan sekmeleri kapatabilmek için)
      const alreadyOpenUris = new Set<string>();
      try {
        for (const group of vscode.window.tabGroups.all) {
          for (const tab of group.tabs) {
            const tabUri = (tab.input as any)?.uri?.toString();
            if (tabUri) alreadyOpenUris.add(tabUri);
          }
        }
      } catch {
        // Tab groups API desteklenmezse yoksay
      }

      let totalChangedFiles = 0;
      let totalChangedClasses = 0;
      const workspaceEdit = new vscode.WorkspaceEdit();
      const modifiedUris: vscode.Uri[] = [];

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Tailwind Workspace Taranıyor ve Düzeltiliyor...',
          cancellable: false
        },
        async (progress) => {
          for (let i = 0; i < eligibleFiles.length; i++) {
            const uri = eligibleFiles[i];
            const document = await vscode.workspace.openTextDocument(uri);
            const docOptions = getOptions(uri);
            const matches = scanDocumentForFixes(document.getText(), docOptions);

            if (matches.length > 0) {
              let fileApplied = 0;
              const sortedDesc = [...matches].sort((a, b) => b.startOffset - a.startOffset);
              for (const item of sortedDesc) {
                const itemRange = new vscode.Range(
                  document.positionAt(item.startOffset),
                  document.positionAt(item.endOffset)
                );
                if (document.getText(itemRange) === item.originalText) {
                  workspaceEdit.replace(uri, itemRange, item.replacementText);
                  fileApplied++;
                }
              }

              if (fileApplied > 0) {
                totalChangedFiles++;
                totalChangedClasses += fileApplied;
                modifiedUris.push(uri);
              }
            }

            progress.report({
              increment: (1 / eligibleFiles.length) * 100,
              message: `${i + 1}/${eligibleFiles.length} dosya incelendi`
            });
          }

          if (totalChangedClasses > 0) {
            await vscode.workspace.applyEdit(workspaceEdit);

            // Değiştirilen dosyaları diske kaydet ve teşhislerini anında güncelle (sorunların listeden silinmesi için)
            if (options.autoSaveOnWorkspaceFix) {
              for (const uri of modifiedUris) {
                try {
                  const doc = await vscode.workspace.openTextDocument(uri);
                  if (doc.isDirty) {
                    await doc.save();
                  }
                  // Dosya düzeltildiği için teşhisleri derhal temizle/güncelle
                  updateDiagnostics(doc);
                } catch {
                  // Kaydetme hatası
                }
              }

              // Workspace taraması esnasında otomatik açılan sekmeleri temizle
              try {
                for (const group of vscode.window.tabGroups.all) {
                  for (const tab of group.tabs) {
                    const tabUri = (tab.input as any)?.uri?.toString();
                    if (tabUri && !alreadyOpenUris.has(tabUri) && !tab.isDirty) {
                      await vscode.window.tabGroups.close(tab);
                    }
                  }
                }
              } catch {
                // Sekme kapatma API'si
              }
            }

            vscode.window.showInformationMessage(
              `🎉 Başarılı: ${totalChangedFiles} dosyada toplam ${totalChangedClasses} sınıf dönüştürüldü ve kaydedildi!`
            );
          } else {
            vscode.window.showInformationMessage('✨ Workspace genelinde tüm sınıflar zaten kanonik.');
          }
        }
      );
    }
  );

  context.subscriptions.push(fixCurrentFileCmd, fixWorkspaceCmd);
}

export function deactivate() {}

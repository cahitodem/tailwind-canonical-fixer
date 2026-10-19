export type TailwindTargetVersion = 'v3' | 'v4';

export interface RuleOptions {
  convertArbitraryPx: boolean;
  convertBorderRadius: boolean;
  convertV4Canonicals: boolean;
  convertShadowSmToXs?: boolean;
  tailwindVersion?: TailwindTargetVersion;
}

export interface FixDiagnosticMatch {
  startOffset: number;
  endOffset: number;
  originalText: string;
  replacementText: string;
  message: string;
  ruleName: string;
}

// 4px spacing ölçeğine tabi geçerli Tailwind önekleri
// NOT: 'max-w' burada yer almaz çünkü Tailwind'de max-w container sınıfları (max-w-sm, max-w-md vb.) kullanır;
// max-w-[1600px] gibi değerler kasıtlı keyfi değerlerdir ve max-w-400 şeklinde geçersiz bir sınıf üretilmemelidir.
const SPACING_PREFIXES = [
  'w', 'min-w',
  'h', 'min-h', 'max-h',
  'size',
  'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr', 'ps', 'pe',
  'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr', 'ms', 'me',
  'top', 'bottom', 'left', 'right',
  'inset', 'inset-x', 'inset-y',
  'start', 'end',
  'gap', 'gap-x', 'gap-y',
  'space-x', 'space-y',
  'translate-x', 'translate-y',
  'scroll-m', 'scroll-mx', 'scroll-my', 'scroll-mt', 'scroll-mb', 'scroll-ml', 'scroll-mr', 'scroll-ms', 'scroll-me',
  'scroll-p', 'scroll-px', 'scroll-py', 'scroll-pt', 'scroll-pb', 'scroll-pl', 'scroll-pr', 'scroll-ps', 'scroll-pe',
  'basis'
].sort((a, b) => b.length - a.length);

const spacingPattern = SPACING_PREFIXES.join('|');

// Regex: Spacing scale
const ARBITRARY_PX_REGEX = new RegExp(
  `(?<=^|[\\s"'\`{(\\[,/])((?:[a-zA-Z0-9_\\-/:>]|\\[[^\\]]+\\])+:)?(!?)(-?)(${spacingPattern})-\\[(\\d+)px\\](!?)(?=[\\s"'\`}\\]),/\\\\]|$)`,
  'g'
);

// Border radius prefixes
const RADIUS_PREFIXES = [
  'rounded',
  'rounded-t', 'rounded-b', 'rounded-l', 'rounded-r',
  'rounded-tl', 'rounded-tr', 'rounded-bl', 'rounded-br',
  'rounded-s', 'rounded-e', 'rounded-ss', 'rounded-se', 'rounded-es', 'rounded-ee'
].sort((a, b) => b.length - a.length);

// Tailwind v4 Radius Scale
const RADIUS_MAP_V4: Record<string, string> = {
  '0': 'none',
  '2': 'xs',
  '4': 'sm',
  '6': 'md',
  '8': 'lg',
  '12': 'xl',
  '16': '2xl',
  '24': '3xl',
  '32': '4xl',
  '9999': 'full'
};

// Tailwind v3 Radius Scale
const RADIUS_MAP_V3: Record<string, string> = {
  '0': 'none',
  '2': 'sm',
  '4': '', // rounded-[4px] -> rounded
  '6': 'md',
  '8': 'lg',
  '12': 'xl',
  '16': '2xl',
  '24': '3xl',
  '9999': 'full'
};

const radiusPattern = RADIUS_PREFIXES.join('|');
const ARBITRARY_RADIUS_REGEX = new RegExp(
  `(?<=^|[\\s"'\`{(\\[,/])((?:[a-zA-Z0-9_\\-/:>]|\\[[^\\]]+\\])+:)?(!?)(${radiusPattern})-\\[(\\d+)px\\](!?)(?=[\\s"'\`}\\]),/\\\\]|$)`,
  'g'
);

// Border width
const BORDER_WIDTH_PREFIXES = [
  'border', 'border-t', 'border-b', 'border-l', 'border-r',
  'border-x', 'border-y', 'border-s', 'border-e',
  'divide-x', 'divide-y'
].sort((a, b) => b.length - a.length);

const BORDER_WIDTH_MAP: Record<string, string> = {
  '0': '0',
  '1': '',
  '2': '2',
  '4': '4',
  '8': '8'
};

const borderWidthPattern = BORDER_WIDTH_PREFIXES.join('|');
const ARBITRARY_BORDER_WIDTH_REGEX = new RegExp(
  `(?<=^|[\\s"'\`{(\\[,/])((?:[a-zA-Z0-9_\\-/:>]|\\[[^\\]]+\\])+:)?(!?)(${borderWidthPattern})-\\[(\\d+)px\\](!?)(?=[\\s"'\`}\\]),/\\\\]|$)`,
  'g'
);

interface CanonicalRule {
  name: string;
  condition?: (options: RuleOptions) => boolean;
  regex: RegExp;
  replacer: (...args: any[]) => string;
}

const CANONICAL_RULES: CanonicalRule[] = [
  // 1. Gradients (Tailwind v4'te bg-linear-to-* geçerlidir, v3'te bg-gradient-to-* kullanılır)
  {
    name: 'linear-gradient',
    condition: (opts) => opts.tailwindVersion !== 'v3',
    regex: /(?<=^|[\s"'`{(\[,/])((?:[a-zA-Z0-9_\-/:>]|\[[^\]]+\])+:)?(!?)bg-gradient-to-(t|tr|r|br|b|bl|l|tl)(!?)(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, v = '', i1 = '', dir, i2 = '') => `${v}${i1}bg-linear-to-${dir}${i2}`
  },
  {
    name: 'radial-gradient',
    condition: (opts) => opts.tailwindVersion !== 'v3',
    regex: /(?<=^|[\s"'`{(\[,/])((?:[a-zA-Z0-9_\-/:>]|\[[^\]]+\])+:)?(!?)bg-gradient-radial(!?)(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, v = '', i1 = '', i2 = '') => `${v}${i1}bg-radial${i2}`
  },
  {
    name: 'conic-gradient',
    condition: (opts) => opts.tailwindVersion !== 'v3',
    regex: /(?<=^|[\s"'`{(\[,/])((?:[a-zA-Z0-9_\-/:>]|\[[^\]]+\])+:)?(!?)bg-gradient-conic(!?)(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, v = '', i1 = '', i2 = '') => `${v}${i1}bg-conic${i2}`
  },
  // 2. Negative zeros (-z-0 -> z-0 vb.) - hem v3 hem v4 için geçerli
  {
    name: 'negative-zero',
    regex: /(?<=^|[\s"'`{(\[,/])((?:[a-zA-Z0-9_\-/:>]|\[[^\]]+\])+:)?-(z|m|mx|my|mt|mb|ml|mr|ms|me|inset|inset-x|inset-y|top|bottom|left|right|start|end|space-x|space-y|translate-x|translate-y)-0(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, v = '', prop) => `${v}${prop}-0`
  },
  // 3. Stroke width (stroke-[3] -> stroke-3) - v4'te 3 mevcuttur, v3'te sadece 0, 1, 2 vardır
  {
    name: 'stroke-width',
    condition: (opts) => opts.tailwindVersion !== 'v3',
    regex: /(?<=^|[\s"'`{(\[,/])((?:[a-zA-Z0-9_\-/:>]|\[[^\]]+\])+:)?(!?)stroke-\[([0-3])(?:px)?\](!?)(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, v = '', i1 = '', val, i2 = '') => `${v}${i1}stroke-${val}${i2}`
  },
  // 4. Line height zero (leading-[0] -> leading-0)
  {
    name: 'leading-zero',
    condition: (opts) => opts.tailwindVersion !== 'v3',
    regex: /(?<=^|[\s"'`{(\[,/])((?:[a-zA-Z0-9_\-/:>]|\[[^\]]+\])+:)?(!?)leading-\[0(?:px)?\](!?)(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, v = '', i1 = '', i2 = '') => `${v}${i1}leading-0${i2}`
  },
  // 5. Flexbox aliases (flex-grow -> grow, flex-shrink -> shrink) - v3 ve v4 kanonik
  {
    name: 'flex-grow',
    regex: /(?<=^|[\s"'`{(\[,/])((?:[a-zA-Z0-9_\-/:>]|\[[^\]]+\])+:)?(!?)flex-grow(-0)?(!?)(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, v = '', i1 = '', z = '', i2 = '') => `${v}${i1}grow${z}${i2}`
  },
  {
    name: 'flex-shrink',
    regex: /(?<=^|[\s"'`{(\[,/])((?:[a-zA-Z0-9_\-/:>]|\[[^\]]+\])+:)?(!?)flex-shrink(-0)?(!?)(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, v = '', i1 = '', z = '', i2 = '') => `${v}${i1}shrink${z}${i2}`
  },
  // 6. Text overflow
  {
    name: 'text-ellipsis',
    regex: /(?<=^|[\s"'`{(\[,/])((?:[a-zA-Z0-9_\-/:>]|\[[^\]]+\])+:)?(!?)overflow-ellipsis(!?)(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, v = '', i1 = '', i2 = '') => `${v}${i1}text-ellipsis${i2}`
  },
  // 7. Shadow (shadow-sm geçerli bir Tailwind sınıfıdır; yalnızca kullanıcı açıkça convertShadowSmToXs istediğinde dönüştürülür)
  {
    name: 'shadow-xs',
    condition: (opts) => opts.convertShadowSmToXs === true,
    regex: /(?<=^|[\s"'`{(\[,/])((?:[a-zA-Z0-9_\-/:>]|\[[^\]]+\])+:)?(!?)shadow-sm(!?)(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, v = '', i1 = '', i2 = '') => `${v}${i1}shadow-xs${i2}`
  },
  // 8. Duplicate background color conflict (bg-soft-bg bg-soft-bg/95 -> bg-soft-bg/95)
  {
    name: 'bg-opacity-conflict',
    regex: /(?<=^|[\s"'`{(\[,/])bg-([a-zA-Z0-9_-]+)\s+bg-\1\/(\d+)(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, color, opacity) => `bg-${color}/${opacity}`
  },
  // 9. Viewport dimensions (max-h-[100dvh] -> max-h-dvh, 100vh -> screen, 100% -> full)
  {
    name: 'viewport-dvh',
    regex: /(?<=^|[\s"'`{(\[,/])((?:[a-zA-Z0-9_\-/:>]|\[[^\]]+\])+:)?(!?)(max-h|min-h|h)-\[100dvh\](!?)(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, v = '', i1 = '', prefix = '', i2 = '') => `${v}${i1}${prefix}-dvh${i2}`
  },
  {
    name: 'viewport-svh',
    regex: /(?<=^|[\s"'`{(\[,/])((?:[a-zA-Z0-9_\-/:>]|\[[^\]]+\])+:)?(!?)(max-h|min-h|h)-\[100svh\](!?)(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, v = '', i1 = '', prefix = '', i2 = '') => `${v}${i1}${prefix}-svh${i2}`
  },
  {
    name: 'viewport-lvh',
    regex: /(?<=^|[\s"'`{(\[,/])((?:[a-zA-Z0-9_\-/:>]|\[[^\]]+\])+:)?(!?)(max-h|min-h|h)-\[100lvh\](!?)(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, v = '', i1 = '', prefix = '', i2 = '') => `${v}${i1}${prefix}-lvh${i2}`
  },
  {
    name: 'viewport-screen',
    regex: /(?<=^|[\s"'`{(\[,/])((?:[a-zA-Z0-9_\-/:>]|\[[^\]]+\])+:)?(!?)(max-h|min-h|h)-\[100vh\](!?)(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, v = '', i1 = '', prefix = '', i2 = '') => `${v}${i1}${prefix}-screen${i2}`
  },
  {
    name: 'viewport-screen-w',
    regex: /(?<=^|[\s"'`{(\[,/])((?:[a-zA-Z0-9_\-/:>]|\[[^\]]+\])+:)?(!?)(max-w|min-w|w)-\[100vw\](!?)(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, v = '', i1 = '', prefix = '', i2 = '') => `${v}${i1}${prefix}-screen${i2}`
  },
  {
    name: 'dimension-full',
    regex: /(?<=^|[\s"'`{(\[,/])((?:[a-zA-Z0-9_\-/:>]|\[[^\]]+\])+:)?(!?)(max-h|min-h|max-w|min-w|h|w)-\[100%\](!?)(?=[\s"'`}\]),/\\]|$)/g,
    replacer: (_m, v = '', i1 = '', prefix = '', i2 = '') => `${v}${i1}${prefix}-full${i2}`
  }
];

/**
 * Belgedeki tüm metni tarar ve değiştirilmesi gereken yerlerin ofset ve mesaj bilgilerini döner.
 */
export function scanDocumentForFixes(text: string, options: RuleOptions): FixDiagnosticMatch[] {
  const matches: FixDiagnosticMatch[] = [];
  const version = options.tailwindVersion || 'v4';

  // A. Arbitrary Spacing Pixels
  if (options.convertArbitraryPx) {
    let match: RegExpExecArray | null;
    ARBITRARY_PX_REGEX.lastIndex = 0;
    while ((match = ARBITRARY_PX_REGEX.exec(text)) !== null) {
      const fullMatch = match[0];
      const variants = match[1] || '';
      const impPre = match[2] || '';
      const neg = match[3] || '';
      const prefix = match[4];
      const pxStr = match[5];
      const impPost = match[6] || '';

      const px = parseInt(pxStr, 10);
      if (px % 4 === 0) {
        const scale = px / 4;
        // Tailwind v3'te standart spacing ölçeği 96'ya (384px) kadardır
        if (version === 'v3' && scale > 96) {
          continue;
        }

        const normalizedNeg = scale === 0 ? '' : neg;
        const replacement = `${variants}${impPre}${normalizedNeg}${prefix}-${scale}${impPost}`;

        matches.push({
          startOffset: match.index,
          endOffset: match.index + fullMatch.length,
          originalText: fullMatch,
          replacementText: replacement,
          message: `The class '${fullMatch}' can be written as canonical '${replacement}'`,
          ruleName: 'arbitrary-spacing'
        });
      }
    }
  }

  // B. Border Radius & Border Width
  if (options.convertBorderRadius) {
    const radiusMap = version === 'v3' ? RADIUS_MAP_V3 : RADIUS_MAP_V4;

    let match: RegExpExecArray | null;
    ARBITRARY_RADIUS_REGEX.lastIndex = 0;
    while ((match = ARBITRARY_RADIUS_REGEX.exec(text)) !== null) {
      const fullMatch = match[0];
      const variants = match[1] || '';
      const impPre = match[2] || '';
      const prefix = match[3];
      const pxStr = match[4];
      const impPost = match[5] || '';

      const token = radiusMap[pxStr];
      if (token !== undefined) {
        const suffix = token === '' ? '' : `-${token}`;
        const replacement = `${variants}${impPre}${prefix}${suffix}${impPost}`;
        matches.push({
          startOffset: match.index,
          endOffset: match.index + fullMatch.length,
          originalText: fullMatch,
          replacementText: replacement,
          message: `The class '${fullMatch}' can be written as canonical '${replacement}'`,
          ruleName: 'border-radius'
        });
      }
    }

    // Border Width
    let bwMatch: RegExpExecArray | null;
    ARBITRARY_BORDER_WIDTH_REGEX.lastIndex = 0;
    while ((bwMatch = ARBITRARY_BORDER_WIDTH_REGEX.exec(text)) !== null) {
      const fullMatch = bwMatch[0];
      const variants = bwMatch[1] || '';
      const impPre = bwMatch[2] || '';
      const prefix = bwMatch[3];
      const pxStr = bwMatch[4];
      const impPost = bwMatch[5] || '';

      const token = BORDER_WIDTH_MAP[pxStr];
      if (token !== undefined) {
        const suffix = token === '' ? '' : `-${token}`;
        const replacement = `${variants}${impPre}${prefix}${suffix}${impPost}`;
        matches.push({
          startOffset: bwMatch.index,
          endOffset: bwMatch.index + fullMatch.length,
          originalText: fullMatch,
          replacementText: replacement,
          message: `The class '${fullMatch}' can be written as canonical '${replacement}'`,
          ruleName: 'border-width'
        });
      }
    }
  }

  // C. Tailwind Canonicals
  if (options.convertV4Canonicals) {
    for (const rule of CANONICAL_RULES) {
      if (rule.condition && !rule.condition(options)) {
        continue;
      }

      let match: RegExpExecArray | null;
      rule.regex.lastIndex = 0;
      while ((match = rule.regex.exec(text)) !== null) {
        const fullMatch = match[0];
        const replacement = rule.replacer(...match);
        if (replacement !== fullMatch) {
          matches.push({
            startOffset: match.index,
            endOffset: match.index + fullMatch.length,
            originalText: fullMatch,
            replacementText: replacement,
            message: `The class '${fullMatch}' can be written as canonical '${replacement}'`,
            ruleName: rule.name
          });
        }
      }
    }
  }

  // Çakışan ofsetleri engellemek için sıralama ve çakışma giderme
  matches.sort((a, b) => a.startOffset - b.startOffset);
  const nonOverlapping: FixDiagnosticMatch[] = [];
  let lastEnd = -1;
  for (const item of matches) {
    if (item.startOffset >= lastEnd) {
      nonOverlapping.push(item);
      lastEnd = item.endOffset;
    }
  }
  return nonOverlapping;
}

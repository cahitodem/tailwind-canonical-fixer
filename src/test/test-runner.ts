import * as assert from 'assert';
import { scanDocumentForFixes, RuleOptions } from '../rules';

const defaultOptionsV4: RuleOptions = {
  convertArbitraryPx: true,
  convertBorderRadius: true,
  convertV4Canonicals: true,
  tailwindVersion: 'v4'
};

const defaultOptionsV3: RuleOptions = {
  convertArbitraryPx: true,
  convertBorderRadius: true,
  convertV4Canonicals: true,
  tailwindVersion: 'v3'
};

function applyFixes(text: string, options: RuleOptions = defaultOptionsV4): string {
  const matches = scanDocumentForFixes(text, options);
  const sortedDesc = [...matches].sort((a, b) => b.startOffset - a.startOffset);
  let result = text;
  for (const m of sortedDesc) {
    result = result.slice(0, m.startOffset) + m.replacementText + result.slice(m.endOffset);
  }
  return result;
}

console.log('--- Running Tailwind Canonical Fixer Tests ---');

// Test 1: max-w-[1600px] should NOT be touched (max-w uses container scale, not numeric)
{
  const input = 'max-w-[1600px] max-w-[1200px]';
  const output = applyFixes(input);
  assert.strictEqual(output, input, `Test 1 Failed: max-w should NOT be converted to non-existent numeric classes`);
  console.log('✓ Test 1: max-w arbitrary values untouched passed');
}

// Test 2: shadow-sm should NOT be touched by default
{
  const input = 'shadow-sm hover:shadow-sm';
  const output = applyFixes(input);
  assert.strictEqual(output, input, `Test 2 Failed: shadow-sm is a valid Tailwind utility and must NOT be converted by default`);
  console.log('✓ Test 2: shadow-sm untouched by default passed');
}

// Test 3: shadow-sm CAN be converted if convertShadowSmToXs is explicitly enabled
{
  const input = 'shadow-sm hover:shadow-sm';
  const expected = 'shadow-xs hover:shadow-xs';
  const output = applyFixes(input, { ...defaultOptionsV4, convertShadowSmToXs: true });
  assert.strictEqual(output, expected, `Test 3 Failed:\nExpected: ${expected}\nGot:      ${output}`);
  console.log('✓ Test 3: shadow-sm opt-in conversion passed');
}

// Test 4: Spacing scale arbitrary px
{
  const input = 'min-w-[500px] w-[16px] p-[8px] -top-[16px] top-[0px] -top-[0px] hover:min-w-[500px] !min-w-[500px] min-w-[500px]!';
  const expected = 'min-w-125 w-4 p-2 -top-4 top-0 top-0 hover:min-w-125 !min-w-125 min-w-125!';
  const output = applyFixes(input);
  assert.strictEqual(output, expected, `Test 4 Failed:\nExpected: ${expected}\nGot:      ${output}`);
  console.log('✓ Test 4: Spacing scale passed');
}

// Test 5: Border radius in v4
{
  const input = 'rounded-[32px] rounded-[16px] rounded-[0px] rounded-[9999px] rounded-t-[8px] hover:rounded-[32px]';
  const expected = 'rounded-4xl rounded-2xl rounded-none rounded-full rounded-t-lg hover:rounded-4xl';
  const output = applyFixes(input, defaultOptionsV4);
  assert.strictEqual(output, expected, `Test 5 Failed:\nExpected: ${expected}\nGot:      ${output}`);
  console.log('✓ Test 5: Border radius (v4) passed');
}

// Test 6: Border radius in v3
{
  const input = 'rounded-[4px] rounded-[2px] rounded-[16px] rounded-[0px]';
  const expected = 'rounded rounded-sm rounded-2xl rounded-none';
  const output = applyFixes(input, defaultOptionsV3);
  assert.strictEqual(output, expected, `Test 6 Failed:\nExpected: ${expected}\nGot:      ${output}`);
  console.log('✓ Test 6: Border radius (v3) passed');
}

// Test 7: Gradients in v4 vs v3
{
  const input = 'bg-gradient-to-br bg-gradient-to-r bg-gradient-radial bg-gradient-conic hover:bg-gradient-to-t';
  const expectedV4 = 'bg-linear-to-br bg-linear-to-r bg-radial bg-conic hover:bg-linear-to-t';
  const outputV4 = applyFixes(input, defaultOptionsV4);
  assert.strictEqual(outputV4, expectedV4, `Test 7 (v4) Failed`);

  const outputV3 = applyFixes(input, defaultOptionsV3);
  assert.strictEqual(outputV3, input, `Test 7 (v3) Failed: v3 must keep bg-gradient-to-*`);
  console.log('✓ Test 7: Gradients v4 and v3 compatibility passed');
}

// Test 8: Flex aliases, Text ellipsis & Negative zero
{
  const input = 'flex-grow flex-grow-0 flex-shrink flex-shrink-0 overflow-ellipsis -z-0 -m-0';
  const expected = 'grow grow-0 shrink shrink-0 text-ellipsis z-0 m-0';
  const output = applyFixes(input);
  assert.strictEqual(output, expected, `Test 8 Failed:\nExpected: ${expected}\nGot:      ${output}`);
  console.log('✓ Test 8: Flex aliases, Text ellipsis & Negative zero passed');
}

// Test 9: Duplicate background opacity conflict
{
  const input = 'bg-soft-bg bg-soft-bg/95';
  const expected = 'bg-soft-bg/95';
  const output = applyFixes(input);
  assert.strictEqual(output, expected, `Test 9 Failed:\nExpected: ${expected}\nGot:      ${output}`);
  console.log('✓ Test 9: Duplicate background opacity conflict passed');
}

// Test 10: Real-world Next.js JSX snippet with multiple classes
{
  const jsxInput = `
  <div className="flex flex-shrink-0 shadow-sm max-w-[1600px] min-w-[500px] rounded-[32px]">
    <span className="p-[16px] border-[1px] -m-0 overflow-ellipsis">Card Content</span>
  </div>
  `;

  const expectedJsx = `
  <div className="flex shrink-0 shadow-sm max-w-[1600px] min-w-125 rounded-4xl">
    <span className="p-4 border m-0 text-ellipsis">Card Content</span>
  </div>
  `;

  const output = applyFixes(jsxInput, defaultOptionsV4);
  assert.strictEqual(output, expectedJsx, `Test 10 Failed:\nExpected: ${expectedJsx}\nGot:      ${output}`);
  console.log('✓ Test 10: Complex Real-world JSX snippet passed');
}

// Test 11: Viewport & Dimension canonicals (max-h-[100dvh] -> max-h-dvh, 100vh -> screen, 100% -> full)
{
  const input = 'max-h-[100dvh] h-[100vh] w-[100vw] h-[100%] min-w-[100%]';
  const expected = 'max-h-dvh h-screen w-screen h-full min-w-full';
  const output = applyFixes(input);
  assert.strictEqual(output, expected, `Test 11 Failed:\nExpected: ${expected}\nGot:      ${output}`);
  console.log('✓ Test 11: Viewport & Dimension canonicals passed');
}

console.log('--- ALL TESTS PASSED SUCCESSFULLY! 🎉 ---');


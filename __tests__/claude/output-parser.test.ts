import { parseClaudeOutput } from '../../src/claude/output-parser';

describe('parseClaudeOutput', () => {
  it('should parse valid JSON output', () => {
    const raw = JSON.stringify({
      result: 'Fixed the bug',
      session_id: 'sess-abc',
      cost_usd: 0.05,
      is_error: false,
      total_tokens_in: 3000,
      total_tokens_out: 800,
    });

    const output = parseClaudeOutput(raw);
    expect(output.result).toBe('Fixed the bug');
    expect(output.session_id).toBe('sess-abc');
    expect(output.cost_usd).toBe(0.05);
    expect(output.is_error).toBe(false);
    expect(output.total_tokens_in).toBe(3000);
    expect(output.total_tokens_out).toBe(800);
  });

  it('should handle missing optional fields with defaults', () => {
    const raw = JSON.stringify({ result: 'Done' });
    const output = parseClaudeOutput(raw);
    expect(output.result).toBe('Done');
    expect(output.session_id).toBe('');
    expect(output.cost_usd).toBe(0);
    expect(output.is_error).toBe(false);
    expect(output.total_tokens_in).toBe(0);
    expect(output.total_tokens_out).toBe(0);
  });

  it('should parse stream-json result fields from Claude CLI', () => {
    const raw = JSON.stringify({
      type: 'result',
      result: 'Done',
      session_id: 'sess-stream',
      total_cost_usd: 0.1234,
      usage: {
        input_tokens: 123,
        output_tokens: 456,
      },
    });
    const output = parseClaudeOutput(raw);
    expect(output.result).toBe('Done');
    expect(output.session_id).toBe('sess-stream');
    expect(output.cost_usd).toBe(0.1234);
    expect(output.total_tokens_in).toBe(123);
    expect(output.total_tokens_out).toBe(456);
  });

  it('should throw on empty output', () => {
    expect(() => parseClaudeOutput('')).toThrow('no output');
    expect(() => parseClaudeOutput('   ')).toThrow('no output');
  });

  it('should throw on non-JSON output', () => {
    expect(() => parseClaudeOutput('not json')).toThrow('Failed to parse');
  });

  it('should throw on non-object JSON', () => {
    expect(() => parseClaudeOutput('"just a string"')).toThrow('not a JSON object');
    expect(() => parseClaudeOutput('[1,2,3]')).toThrow('not a JSON object');
  });

  it('should throw when result field is missing', () => {
    const raw = JSON.stringify({ session_id: 'abc' });
    expect(() => parseClaudeOutput(raw)).toThrow('missing "result"');
  });

  it('should trim whitespace from output before parsing', () => {
    const raw = `  ${JSON.stringify({ result: 'ok' })}  \n`;
    const output = parseClaudeOutput(raw);
    expect(output.result).toBe('ok');
  });
});

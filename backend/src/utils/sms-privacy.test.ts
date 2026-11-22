import { describe, expect, it } from 'vitest';
import { maskPhone, scrubProviderText } from './sms-privacy';

describe('maskPhone', () => {
  it('keeps only the last three digits', () => {
    expect(maskPhone('0771234567')).toBe('*******567');
    expect(maskPhone('+94771234567')).toBe('*********567');
  });

  it('never reveals a short number', () => {
    expect(maskPhone('0771')).toBe('*771');
    expect(maskPhone('123')).toBe('***');
    expect(maskPhone('12')).toBe('**');
    expect(maskPhone('')).toBe('');
  });

  it('ignores spaces and dashes when counting what to hide', () => {
    expect(maskPhone('077 123-4567')).toBe('*******567');
  });
});

describe('scrubProviderText', () => {
  it('keeps the reason and hides any long digit run in it', () => {
    expect(scrubProviderText('Invalid number 94771234567 for sender')).toBe('Invalid number *** for sender');
    expect(scrubProviderText('Insufficient balance')).toBe('Insufficient balance');
  });

  it('keeps short numbers such as error codes', () => {
    expect(scrubProviderText('Error 1005: rejected')).toBe('Error 1005: rejected');
  });

  it('shortens a long body and answers null for nothing', () => {
    const long = 'x'.repeat(500);
    expect(scrubProviderText(long)).toHaveLength(120);
    expect(scrubProviderText(long)?.endsWith('…')).toBe(true);
    expect(scrubProviderText(null)).toBeNull();
    expect(scrubProviderText('   ')).toBeNull();
  });
});

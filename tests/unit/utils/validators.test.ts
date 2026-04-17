import { describe, it, expect } from 'vitest';
import { validateEmail, validatePasswordComplexity } from '../../../src/utils/validators';

describe('validateEmail', () => {
  it('accepts valid email', () => {
    expect(validateEmail('user@example.com')).toBe(true);
  });

  it('rejects missing @', () => {
    expect(validateEmail('userexample.com')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(validateEmail('user@')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateEmail('')).toBe(false);
  });
});

describe('validatePasswordComplexity', () => {
  it('accepts a valid complex password', () => {
    const result = validatePasswordComplexity('Abcdef1!');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects passwords shorter than 8 chars', () => {
    const result = validatePasswordComplexity('Ab1!');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('8'))).toBe(true);
  });

  it('rejects passwords longer than 128 chars', () => {
    const long = 'Abcdef1!'.repeat(20);
    const result = validatePasswordComplexity(long);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('128'))).toBe(true);
  });

  it('rejects missing uppercase', () => {
    const result = validatePasswordComplexity('abcdef1!');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('uppercase'))).toBe(true);
  });

  it('rejects missing lowercase', () => {
    const result = validatePasswordComplexity('ABCDEF1!');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('lowercase'))).toBe(true);
  });

  it('rejects missing digit', () => {
    const result = validatePasswordComplexity('Abcdefg!');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('digit'))).toBe(true);
  });

  it('rejects missing special character', () => {
    const result = validatePasswordComplexity('Abcdef12');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('special'))).toBe(true);
  });
});

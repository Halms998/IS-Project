
import { CryptoError, Envelope } from '../types';

/**
 * Checks whether a string is a non-empty, correctly padded Base64 value.
 *
 * This checks encoding only. It does not verify cryptographic authenticity.
 */
export function isValidBase64(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }

  const base64Pattern =
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

  return base64Pattern.test(value);
}

/**
 * Validates one encrypted ballot field.
 */
export function validateBase64Field(
  value: unknown,
  fieldName: string
): string {
  if (!isValidBase64(value)) {
    throw new CryptoError(
      `Invalid ${fieldName}: expected a non-empty Base64 value.`
    );
  }

  return value;
}

/**
 * Validates an encrypted ballot envelope before storage or tallying.
 *
 * An envelope consists of:
 * - ballot: encrypted vote
 * - mac: authenticity information
 */
export function validateEnvelope(value: unknown): Envelope {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new CryptoError('Invalid ballot envelope: expected an object.');
  }

  const envelope = value as Record<string, unknown>;

  const ballot = validateBase64Field(envelope.ballot, 'ballot');
  const mac = validateBase64Field(envelope.mac, 'MAC');

  return { ballot, mac };
}

/**
 * Validates multiple envelopes before sending them to tally-votes.
 */
export function validateEnvelopes(value: unknown): Envelope[] {
  if (!Array.isArray(value)) {
    throw new CryptoError('Invalid ballot collection: expected an array.');
  }

  return value.map((envelope, index) => {
    try {
      return validateEnvelope(envelope);
    } catch (error) {
      if (error instanceof CryptoError) {
        throw new CryptoError(
          `Invalid envelope at position ${index + 1}: ${error.message}`
        );
      }

      throw error;
    }
  });
}

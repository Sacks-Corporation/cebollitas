import { Fernet, InvalidToken } from './fernet';

// Throwaway test key; the token below was produced by Python's
// `cryptography.fernet.Fernet(KEY).encrypt(b'{"fun": 7, "cost": 8, "originality": 10}')`.
const KEY = 'cw_0x689RpI-jtRR7oE8h_eQsKImvJ8-JZlIDYmHfNQ=';
const PYTHON_TOKEN =
  'gAAAAABrBHJaSSLL_yLZVhS8ZWwumF5xIm5JaljsSqnOrJmz6mYTG99sDk1yaT41JSfaobb7HNe28kMCZB6_S2er9pgcgTiWVsjJNdVKP485WWF5muWYPJXWaRIPsJosUyFJAfiG7aG4';

describe('Fernet', () => {
  it('decrypts a token produced by Python', () => {
    expect(new Fernet(KEY).decrypt(PYTHON_TOKEN).toString('utf-8')).toBe('{"fun": 7, "cost": 8, "originality": 10}');
  });

  it('round-trips', () => {
    const fernet = new Fernet(KEY);
    const token = fernet.encrypt(Buffer.from('hola'));
    expect(token.startsWith('gAAAAA')).toBe(true);
    expect(fernet.decrypt(token).toString()).toBe('hola');
  });

  it('rejects tampered tokens and other keys', () => {
    const fernet = new Fernet(KEY);
    const tampered = PYTHON_TOKEN.slice(0, 40) + (PYTHON_TOKEN[40] === 'A' ? 'B' : 'A') + PYTHON_TOKEN.slice(41);
    expect(() => fernet.decrypt(tampered)).toThrow(InvalidToken);
    expect(() => fernet.decrypt('not-a-token')).toThrow(InvalidToken);
    const other = new Fernet(Buffer.alloc(32, 7).toString('base64url') + '=');
    expect(() => other.decrypt(PYTHON_TOKEN)).toThrow(InvalidToken);
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(() => new Fernet('c2hvcnQ=')).toThrow();
  });
});

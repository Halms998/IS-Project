// Browser-side Paillier cryptosystem (additively homomorphic).
// Demo only: uses native BigInt and WebCrypto, no external dependencies.

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const THREE = BigInt(3);

export interface PublicKey {
  n: bigint;
  n2: bigint;
  bits: number;
}

export interface PrivateKey {
  lambda: bigint;
  mu: bigint;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = ONE;
  let b = base % mod;
  let e = exp;
  while (e > ZERO) {
    if ((e & ONE) === ONE) result = (result * b) % mod;
    e = e >> ONE;
    b = (b * b) % mod;
  }
  return result;
}

export function gcd(a: bigint, b: bigint): bigint {
  let x = a;
  let y = b;
  while (y !== ZERO) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function modInv(a: bigint, m: bigint): bigint {
  let oldR = a % m;
  let r = m;
  let oldS = ONE;
  let s = ZERO;
  while (r !== ZERO) {
    const q = oldR / r;
    const nextR = oldR - q * r;
    oldR = r;
    r = nextR;
    const nextS = oldS - q * s;
    oldS = s;
    s = nextS;
  }
  if (oldR !== ONE) throw new Error('No modular inverse exists');
  return ((oldS % m) + m) % m;
}

export function randomBits(bits: number): bigint {
  const buf = new Uint8Array(Math.ceil(bits / 8));
  crypto.getRandomValues(buf);
  let hex = '';
  buf.forEach((byte) => {
    hex += byte.toString(16).padStart(2, '0');
  });
  const mask = (ONE << BigInt(bits)) - ONE;
  return BigInt('0x' + hex) & mask;
}

// Uniform random value in [0, max)
export function randomBelow(max: bigint): bigint {
  const bits = max.toString(2).length;
  for (;;) {
    const v = randomBits(bits);
    if (v < max) return v;
  }
}

const SMALL_PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71].map(
  (p) => BigInt(p),
);

export function isProbablePrime(n: bigint, rounds = 24): boolean {
  if (n < TWO) return false;
  for (const p of SMALL_PRIMES) {
    if (n === p) return true;
    if (n % p === ZERO) return false;
  }
  const nMinusOne = n - ONE;
  let d = nMinusOne;
  let s = 0;
  while ((d & ONE) === ZERO) {
    d = d >> ONE;
    s++;
  }
  for (let i = 0; i < rounds; i++) {
    const a = randomBelow(n - THREE) + TWO; // in [2, n-2]
    let x = modPow(a, d, n);
    if (x === ONE || x === nMinusOne) continue;
    let composite = true;
    for (let r = 1; r < s; r++) {
      x = (x * x) % n;
      if (x === nMinusOne) {
        composite = false;
        break;
      }
    }
    if (composite) return false;
  }
  return true;
}

async function generatePrime(bits: number): Promise<bigint> {
  const top = ONE << BigInt(bits - 1);
  let attempts = 0;
  for (;;) {
    const candidate = randomBits(bits) | top | ONE;
    if (isProbablePrime(candidate)) return candidate;
    attempts++;
    if (attempts % 25 === 0) await tick(); // keep the page responsive
  }
}

export async function generateKeys(
  bits: number,
  onProgress?: (message: string) => void,
): Promise<{ pub: PublicKey; priv: PrivateKey }> {
  const half = bits / 2;
  for (;;) {
    onProgress?.('Searching for the first prime…');
    await tick();
    const p = await generatePrime(half);
    onProgress?.('Searching for the second prime…');
    await tick();
    const q = await generatePrime(half);
    if (p === q) continue;
    const n = p * q;
    if (n.toString(2).length !== bits) continue;
    const pm = p - ONE;
    const qm = q - ONE;
    const lambda = (pm * qm) / gcd(pm, qm);
    try {
      // With g = n + 1, L(g^lambda mod n^2) = lambda mod n, so mu = lambda^-1 mod n.
      const mu = modInv(lambda % n, n);
      onProgress?.('Keys ready.');
      return { pub: { n, n2: n * n, bits }, priv: { lambda, mu } };
    } catch {
      continue;
    }
  }
}

export function encrypt(pub: PublicKey, m: bigint): bigint {
  let r: bigint;
  do {
    r = randomBelow(pub.n);
  } while (r === ZERO || gcd(r, pub.n) !== ONE);
  const gm = (ONE + m * pub.n) % pub.n2; // g^m with g = n + 1
  return (gm * modPow(r, pub.n, pub.n2)) % pub.n2;
}

export function decrypt(pub: PublicKey, priv: PrivateKey, c: bigint): bigint {
  const u = modPow(c, priv.lambda, pub.n2);
  const l = (u - ONE) / pub.n;
  return (l * priv.mu) % pub.n;
}

// Multiplying ciphertexts adds the plaintexts.
export function addCipher(pub: PublicKey, a: bigint, b: bigint): bigint {
  return (a * b) % pub.n2;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  bytes.forEach((byte) => {
    out += byte.toString(16).padStart(2, '0');
  });
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(new Uint8Array(digest));
}

export async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return toHex(new Uint8Array(sig));
}

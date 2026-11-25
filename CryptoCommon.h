#ifndef CRYPTO_COMMON_H
#define CRYPTO_COMMON_H
#include <string>
#include <gmp.h>
#include "paillier.h"
#define KEY_LENGTH 2048
#define KEY_LENGTH_HEX KEY_LENGTH / 4
#define TOKEN_LENGTH KEY_LENGTH - 256
#define KEY_FILE_PUBLIC "public-key.txt"
#define KEY_FILE_PRIVATE "private-key.txt"

// Converts a ciphertext into a base 64 string.
std::string ciphertext_base64(paillier_ciphertext_t* ciphertext);

// Sets rop to a GMP integer of the SHA-256 digest of a ciphertext.
void ciphertext_sha256(mpz_t& rop, paillier_ciphertext_t* ciphertext);

// Removes hyphens from a voter token from stdin.
// Returns false if non-numeric characters other than hyphens are found.
bool sanitize_voter_token(std::string& str_voter_token);

// Converts a base 64 string (as produced by ciphertext_base64) back into a ciphertext.
paillier_ciphertext_t* base64_ciphertext(const std::string& encoded);

#endif

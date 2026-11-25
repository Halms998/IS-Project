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

// Results of read_pubkey_from_file.
#define PUBKEY_OK 0
#define PUBKEY_NO_FILE 1
#define PUBKEY_CORRUPT 2

// Used when the administrator does not give the election a name.
#define DEFAULT_ELECTION_NAME "Election"

// Reads the public key file written by admin-keygen: the key on the first line, then the
// numbers of candidates and of voters. If pub is NULL, only the two numbers are read.
// Returns PUBKEY_OK, PUBKEY_NO_FILE or PUBKEY_CORRUPT.
int read_pubkey_from_file(int& numCandidates, int& numVoters, paillier_pubkey_t** pub);

// Same as above, but also reads the election name and the e-mail address for votes.
// Files from before these lines were added give the default name and an empty address.
int read_pubkey_from_file(int& numCandidates, int& numVoters, paillier_pubkey_t** pub,
	std::string& electionName, std::string& electionEmailAddress);

// Converts a ciphertext into a base 64 string.
std::string ciphertext_base64(paillier_ciphertext_t* ciphertext);

// Sets rop to a GMP integer of the SHA-256 digest of a ciphertext.
void ciphertext_sha256(mpz_t& rop, paillier_ciphertext_t* ciphertext);

// Sets rop to a GMP integer of the HMAC-SHA256 of a ciphertext, keyed with the voter token
// (its decimal digits). Unlike a plain SHA-256 digest, nobody can compute it for a modified
// ballot without knowing the token, so the encrypted authenticity value cannot be adjusted.
void ciphertext_hmac_sha256(mpz_t& rop, paillier_ciphertext_t* ciphertext, const mpz_t token);

// Removes hyphens from a voter token from stdin.
// Returns false if non-numeric characters other than hyphens are found.
bool sanitize_voter_token(std::string& str_voter_token);

// Converts a base 64 string (as produced by ciphertext_base64) back into a ciphertext.
paillier_ciphertext_t* base64_ciphertext(const std::string& encoded);

#endif

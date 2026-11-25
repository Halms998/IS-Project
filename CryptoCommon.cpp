#include <cstring>
#include <fstream>
#include <limits>
#include <vector>
#include <cryptopp/cryptlib.h>
#include <cryptopp/sha.h>
#include <cryptopp/hmac.h>
#include <cryptopp/base64.h>
#include "CryptoCommon.h"
using namespace std;
using namespace CryptoPP;

// Removes a trailing carriage return left by a file saved with Windows line endings.
static void strip_cr(string& line){
	if(!line.empty() && line.back() == '\r'){
		line.pop_back();
	}
}

int read_pubkey_from_file(int& numCandidates, int& numVoters, paillier_pubkey_t** pub){
	string electionName, electionEmailAddress;
	return read_pubkey_from_file(numCandidates, numVoters, pub, electionName, electionEmailAddress);
}

int read_pubkey_from_file(int& numCandidates, int& numVoters, paillier_pubkey_t** pub,
	string& electionName, string& electionEmailAddress){
	ifstream ifs(KEY_FILE_PUBLIC);
	if(!ifs){
		return PUBKEY_NO_FILE;
	}
	string hex;
	getline(ifs, hex);
	ifs >> numCandidates >> numVoters;
	if(!ifs || numCandidates < 2 || numVoters < 2){
		return PUBKEY_CORRUPT;
	}
	strip_cr(hex);
	// Lines 4 and 5 are optional.
	ifs.ignore(numeric_limits<streamsize>::max(), '\n');
	electionName.clear();
	electionEmailAddress.clear();
	getline(ifs, electionName);
	getline(ifs, electionEmailAddress);
	strip_cr(electionName);
	strip_cr(electionEmailAddress);
	if(electionName.empty()){
		electionName = DEFAULT_ELECTION_NAME;
	}
	if(pub != NULL){
		if(hex.empty()){
			return PUBKEY_CORRUPT;
		}
		// paillier_pubkey_from_hex takes a non-const C string.
		vector<char> buffer(hex.begin(), hex.end());
		buffer.push_back('\0');
		*pub = paillier_pubkey_from_hex(buffer.data());
		if(*pub == NULL){
			return PUBKEY_CORRUPT;
		}
	}
	return PUBKEY_OK;
}

string ciphertext_base64(paillier_ciphertext_t* ciphertext){
	// Export the ciphertext to bytes.
	size_t ct_as_bytes_length;
	byte* ct_as_bytes = (byte*)mpz_export(NULL, &ct_as_bytes_length, 1, 1, 1, 0, ciphertext->c);
	// Convert the bytes to base 64.
	string encoded;
	StringSource ss(ct_as_bytes, ct_as_bytes_length, true, new Base64Encoder(new StringSink(encoded)));
	// Clean up.
	free(ct_as_bytes);
	return encoded;
}

void ciphertext_sha256(mpz_t& rop, paillier_ciphertext_t* ciphertext){
	// Export the ciphertext to bytes.
	size_t ct_as_bytes_length;
	byte* ct_as_bytes = (byte*)mpz_export(NULL, &ct_as_bytes_length, 1, 1, 1, 0, ciphertext->c);
	// Calculate the SHA-256 digest.
	byte digest[SHA256::DIGESTSIZE];
	SHA256().CalculateDigest(digest, ct_as_bytes, ct_as_bytes_length);
	// Put the digest into an GMP integer.
	mpz_init(rop);
	mpz_import(rop, SHA256::DIGESTSIZE, 1, 1, 1, 0, digest);
	// Clean up.
	free(ct_as_bytes);
}

void ciphertext_hmac_sha256(mpz_t& rop, paillier_ciphertext_t* ciphertext, const mpz_t token){
	// The key is the token in base 10 without hyphens or leading zeros, so cast-vote and
	// tally-votes always derive the same key from the same token.
	vector<char> key(mpz_sizeinbase(token, 10) + 2);
	mpz_get_str(key.data(), 10, token);
	size_t key_length = strlen(key.data());
	// Export the ciphertext to bytes.
	size_t ct_as_bytes_length;
	byte* ct_as_bytes = (byte*)mpz_export(NULL, &ct_as_bytes_length, 1, 1, 1, 0, ciphertext->c);
	// Calculate the HMAC-SHA256.
	byte digest[HMAC<SHA256>::DIGESTSIZE];
	HMAC<SHA256> hmac((const byte*)key.data(), key_length);
	hmac.CalculateDigest(digest, ct_as_bytes, ct_as_bytes_length);
	// Put the digest into a GMP integer.
	mpz_init(rop);
	mpz_import(rop, HMAC<SHA256>::DIGESTSIZE, 1, 1, 1, 0, digest);
	// Clean up.
	free(ct_as_bytes);
}

bool sanitize_voter_token(string& str_voter_token){
	// Allocate a character array.
	char* temp = (char*) malloc(str_voter_token.size() + 1);
	size_t i = 0;
	// Copy numeric characters to the character array.
	for(char c : str_voter_token){
		if('0' <= c && c <= '9'){
			// This is a numeric character.
			temp[i++] = c;
		}else if(c != '-'){
			// This is not a numeric character, and it is not a hyphen.
			free(temp);
			return false;
		}
	}
	// Terminate the character array.
	temp[i] = 0;
	// Set the original string to the string version of this character array.
	str_voter_token = temp;
	// Clean up.
	free(temp);
	return true;
}

paillier_ciphertext_t* base64_ciphertext(const string& encoded){
	// Convert the base 64 string back to a string of bytes. Line breaks are ignored.
	string decoded;
	StringSource ss(encoded, true, new Base64Decoder(new StringSink(decoded)));
	// Import these bytes into a new ciphertext.
	paillier_ciphertext_t* ciphertext = paillier_create_enc_zero();
	mpz_import(ciphertext->c, decoded.length(), 1, 1, 1, 0, decoded.c_str());
	return ciphertext;
}

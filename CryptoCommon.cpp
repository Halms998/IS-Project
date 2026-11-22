#include "CryptoCommon.h"
using namespace std;
using namespace CryptoPP;

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

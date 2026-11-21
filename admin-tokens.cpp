#include <fstream>
#include <iostream>
#include <set>
#include <string>
#include <vector>
#include "CryptoCommon.h"
using namespace std;

// Voter tokens are random 128-bit numbers. That is short enough for a person to type
// (39 digits, shown in groups) and far below the size limit enforced by cast-vote, while
// still being infeasible to guess.
#define TOKEN_BITS 128
#define TOKEN_BYTES (TOKEN_BITS / 8)
#define TOKEN_DIGITS 39
#define TOKEN_GROUP_SIZE 5
#define TOKEN_FILE "tokens.txt"

// Formats a token as a zero-padded decimal string with hyphens between groups of digits.
// Because the width is fixed, two tokens are equal if and only if their strings are equal.
static string format_token(const mpz_t token){
	// mpz_get_str needs room for the digits, a sign, and the terminator.
	char digits[TOKEN_DIGITS + 3];
	mpz_get_str(digits, 10, token);
	string padded(digits);
	if(padded.size() < TOKEN_DIGITS){
		padded.insert(0, TOKEN_DIGITS - padded.size(), '0');
	}
	string formatted;
	for(size_t i = 0; i < padded.size(); i++){
		if(i > 0 && i % TOKEN_GROUP_SIZE == 0){
			formatted += '-';
		}
		formatted += padded[i];
	}
	return formatted;
}

int main(){
	cout << "This program will generate the voter ID tokens for the election." << endl;
	// Read the number of voters from the public key file written by admin-keygen.
	ifstream ifspub(KEY_FILE_PUBLIC);
	if(!ifspub){
		cerr << "Error: could not read public key file. Run admin-keygen first.\n";
		return 1;
	}
	string pubHex;
	int numCandidates, numVoters;
	getline(ifspub, pubHex);
	ifspub >> numCandidates;
	ifspub >> numVoters;
	ifspub.close();
	if(numCandidates < 2 || numVoters < 2){
		cerr << "The numbers of candidates and of voters are corrupt.\n";
		return 2;
	}
	// Never overwrite an existing token file: that would silently invalidate every token
	// that has already been given to a voter.
	ifstream ifsexisting(TOKEN_FILE);
	if(ifsexisting){
		cerr << "Error: " << TOKEN_FILE << " already exists. Move or delete it first if you really want new tokens.\n";
		return 3;
	}
	// Generate one unique, non-zero random token per voter.
	cout << "Generating " << numVoters << " tokens..." << endl;
	set<string> seen;
	vector<string> tokens;
	mpz_t token;
	mpz_init(token);
	while((int) tokens.size() < numVoters){
		unsigned char randomBytes[TOKEN_BYTES];
		paillier_get_rand_devurandom(randomBytes, TOKEN_BYTES);
		mpz_import(token, TOKEN_BYTES, 1, 1, 1, 0, randomBytes);
		if(mpz_sgn(token) == 0){
			// Zero is not a usable token.
			continue;
		}
		string formatted = format_token(token);
		if(seen.insert(formatted).second){
			tokens.push_back(formatted);
		}
	}
	mpz_clear(token);
	// Save the tokens to a file, one per line.
	ofstream ofstokens(TOKEN_FILE);
	if(!ofstokens){
		cerr << "Error: could not write the token file.\n";
		return 4;
	}
	for(const string& t : tokens){
		ofstokens << t << '\n';
	}
	ofstokens.close();
	cout << "Saved " << tokens.size() << " tokens to " << TOKEN_FILE << ".\n"
		<< "Give each voter exactly one token and keep this file secret.\n";
	return 0;
}
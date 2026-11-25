#include <cstring>
#include <fstream>
#include <iostream>
#include <string>
#include <unordered_set>
#include <vector>
#include "CryptoCommon.h"
using namespace std;

#define TOKEN_FILE "tokens.txt"

#define TALLY_OK 0
#define TALLY_NO_PUBLIC_KEY 1
#define TALLY_NO_PRIVATE_KEY 2
#define TALLY_NO_TOKENS 3
#define TALLY_UNTRUSTED 4

static bool load_private_key(paillier_pubkey_t* pub, paillier_prvkey_t*& prv){
	ifstream ifs(KEY_FILE_PRIVATE);
	if(!ifs){
		return false;
	}
	string hex;
	getline(ifs, hex);
	if(!hex.empty() && hex.back() == '\r'){
		hex.pop_back();
	}
	vector<char> buffer(hex.begin(), hex.end());
	buffer.push_back('\0');
	prv = paillier_prvkey_from_hex(buffer.data(), pub);
	return prv != NULL;
}

static string to_decimal(const mpz_t value){
	vector<char> buffer(mpz_sizeinbase(value, 10) + 2);
	mpz_get_str(buffer.data(), 10, value);
	return string(buffer.data());
}

static bool load_tokens(unordered_set<string>& tokens){
	ifstream ifs(TOKEN_FILE);
	if(!ifs){
		return false;
	}
	string line;
	size_t lineNumber = 0;
	while(getline(ifs, line)){
		++lineNumber;
		if(!line.empty() && line.back() == '\r'){
			line.pop_back();
		}
		if(line.empty()){
			continue;
		}
		if(!sanitize_voter_token(line) || line.empty()){
			cerr << "Token error: line " << lineNumber << " of " << TOKEN_FILE << " is not numeric.\n";
			continue;
		}
		mpz_t token;
		if(mpz_init_set_str(token, line.c_str(), 10) == 0){
			tokens.insert(to_decimal(token));
		}else{
			cerr << "Token error: line " << lineNumber << " of " << TOKEN_FILE << " cannot be parsed.\n";
		}
		mpz_clear(token);
	}
	return true;
}

static bool parse_marker(const string& line, const char* marker, string& tag){
	size_t position = line.find(marker);
	if(position == string::npos){
		return false;
	}
	position += strlen(marker);
	size_t end = line.find('-', position);
	tag = line.substr(position, end == string::npos ? string::npos : end - position);
	return true;
}

struct Tally {
	paillier_pubkey_t* pub;
	paillier_prvkey_t* prv;
	unordered_set<string> tokens;
	unordered_set<string> tokensUsed;
	paillier_ciphertext_t* product;
	unsigned long received = 0;
	unsigned long accepted = 0;
	unsigned long rejected = 0;
};

static bool ciphertext_in_range(paillier_pubkey_t* pub, paillier_ciphertext_t* ct){
	return mpz_sgn(ct->c) > 0 && mpz_cmp(ct->c, pub->n_squared) < 0;
}

static void process_envelope(Tally& tally, const string& ballotText, const string& macText, unsigned long envelopeNumber){
	++tally.received;
	paillier_ciphertext_t* ctVote = base64_ciphertext(ballotText);
	paillier_ciphertext_t* ctAuthentic = base64_ciphertext(macText);
	if(!ciphertext_in_range(tally.pub, ctVote) || !ciphertext_in_range(tally.pub, ctAuthentic)){
		cerr << "Rejected: envelope " << envelopeNumber << ": ballot or MAC is not a valid ciphertext\n";
		++tally.rejected;
	}else{
		paillier_plaintext_t* ptAuthentic = paillier_dec(NULL, tally.pub, tally.prv, ctAuthentic);
		mpz_t hashFromVoter, hashRedone, tokenFromVoter;
		mpz_init(hashFromVoter);
		mpz_init(tokenFromVoter);
		mpz_tdiv_r_2exp(hashFromVoter, ptAuthentic->m, 256);
		mpz_tdiv_q_2exp(tokenFromVoter, ptAuthentic->m, 256);
		ciphertext_sha256(hashRedone, ctVote);
		if(mpz_cmp(hashFromVoter, hashRedone) != 0){
			cerr << "Rejected: envelope " << envelopeNumber << ": the checksum is incorrect, so the ballot was modified\n";
			++tally.rejected;
		}else{
			string token = to_decimal(tokenFromVoter);
			if(tally.tokens.find(token) == tally.tokens.end()){
				cerr << "Rejected: envelope " << envelopeNumber << ": the token was never issued\n";
				++tally.rejected;
			}else if(!tally.tokensUsed.insert(token).second){
				cerr << "Rejected: envelope " << envelopeNumber << ": this token has already been used\n";
				++tally.rejected;
			}else{
				paillier_mul(tally.pub, tally.product, tally.product, ctVote);
				++tally.accepted;
			}
		}
		mpz_clear(hashFromVoter);
		mpz_clear(hashRedone);
		mpz_clear(tokenFromVoter);
		paillier_freeplaintext(ptAuthentic);
	}
	paillier_freeciphertext(ctVote);
	paillier_freeciphertext(ctAuthentic);
}

int main(){
	Tally tally;
	int numCandidates, numVoters;
	if(read_pubkey_from_file(numCandidates, numVoters, &tally.pub) != PUBKEY_OK){
		cerr << "The public key file is missing or corrupt.\n";
		return TALLY_NO_PUBLIC_KEY;
	}
	if(!load_private_key(tally.pub, tally.prv)){
		cerr << "The private key file is missing or corrupt.\n";
		return TALLY_NO_PRIVATE_KEY;
	}
	if(!load_tokens(tally.tokens)){
		cerr << "The file containing tokens is missing.\n";
		return TALLY_NO_TOKENS;
	}
	tally.product = paillier_create_enc_zero();
	cerr << "Reading votes from stdin...\n";
	string line, tag, section, ballotText, macText;
	bool inSection = false;
	unsigned long envelopeNumber = 0;
	while(getline(cin, line)){
		if(!line.empty() && line.back() == '\r'){
			line.pop_back();
		}
		if(parse_marker(line, "BEGIN:", tag)){
			section = tag;
			inSection = true;
			if(tag == "BALLOT"){
				if(!ballotText.empty()){
					cerr << "Error: a ballot was followed by another ballot without a MAC; the first one is ignored\n";
				}
				ballotText.clear();
			}else if(tag == "MAC"){
				macText.clear();
			}
		}else if(parse_marker(line, "END:", tag)){
			if(!inSection || tag != section){
				cerr << "Error: an END tag does not match the section that was opened\n";
			}else if(tag == "MAC"){
				++envelopeNumber;
				if(ballotText.empty() || macText.empty()){
					cerr << "Error: envelope " << envelopeNumber << " is missing its ballot or its MAC\n";
					++tally.received;
					++tally.rejected;
				}else{
					process_envelope(tally, ballotText, macText, envelopeNumber);
				}
				ballotText.clear();
				macText.clear();
			}
			inSection = false;
		}else if(inSection){
			if(section == "BALLOT"){
				ballotText += line;
			}else if(section == "MAC"){
				macText += line;
			}
		}
	}
	paillier_plaintext_t* sum = paillier_dec(NULL, tally.pub, tally.prv, tally.product);
	paillier_freeciphertext(tally.product);
	const unsigned long radix = (unsigned long) numVoters + 1;
	unsigned long totalVotes = 0;
	vector<unsigned long> counts(numCandidates);
	for(int c = 0; c < numCandidates; ++c){
		mpz_t place, shifted;
		mpz_init(place);
		mpz_init(shifted);
		mpz_ui_pow_ui(place, radix, c);
		mpz_tdiv_q(shifted, sum->m, place);
		counts[c] = mpz_tdiv_ui(shifted, radix);
		totalVotes += counts[c];
		mpz_clear(place);
		mpz_clear(shifted);
	}
	cout << "Here are the election results:\n";
	for(int c = 0; c < numCandidates; ++c){
		cout << "Candidate " << (c + 1) << ": " << counts[c] << " vote(s)\n";
	}
	cout << "\n  Envelopes received: " << tally.received
		<< "\n  Ballots counted:    " << tally.accepted
		<< "\n  Envelopes rejected: " << tally.rejected
		<< "\n  Votes found:        " << totalVotes << "\n";
	bool trustworthy = true;
	if(totalVotes != tally.accepted){
		cout << "Warning! The votes found do not match the ballots counted. A ballot may contain more than one vote. The results cannot be trusted.\n";
		trustworthy = false;
	}
	mpz_t limit;
	mpz_init(limit);
	mpz_ui_pow_ui(limit, radix, numCandidates);
	if(mpz_cmp(sum->m, limit) >= 0){
		cout << "Warning! A vote for a candidate that does not exist was found. The results cannot be trusted.\n";
		trustworthy = false;
	}
	mpz_clear(limit);
	if(tally.accepted > (unsigned long) numVoters){
		cout << "Warning! More ballots were counted than the number of voters the election was set up for. The results cannot be trusted.\n";
		trustworthy = false;
	}
	if(tally.rejected > 0){
		cout << "Note: " << tally.rejected << " envelope(s) were rejected and not counted. See the messages above.\n";
	}
	paillier_freeplaintext(sum);
	paillier_freepubkey(tally.pub);
	paillier_freeprvkey(tally.prv);
	return trustworthy ? TALLY_OK : TALLY_UNTRUSTED;
}

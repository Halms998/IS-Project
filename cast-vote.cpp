#include <fstream>
#include <iostream>
#include <string>
#include "CryptoCommon.h"
#define EMAIL_TXT "email.txt"
#define EMAIL_SUBJECT_PREFIX "Vote: "
using namespace std;

// Writes the encrypted ballot and its encrypted authenticity value between BEGIN/END markers.
static void print_envelope(ostream& os, paillier_ciphertext_t* ctVote, paillier_ciphertext_t* ctAuthentic){
	os << "---BEGIN:BALLOT---\n" << ciphertext_base64(ctVote) << "----END:BALLOT----\n";
	os << "---BEGIN:MAC---\n" << ciphertext_base64(ctAuthentic) << "----END:MAC----" << endl;
}

int main(){
	// char x[] = "Test";
	// paillier_ciphertext_t* xe = paillier_ciphertext_from_bytes(x, 4);
	// cout << ciphertext_base64(xe) << endl;
	// mpz_t xh;
	// ciphertext_sha256(xh, xe);
	// mpz_out_str(stdout, 16, xh);
	// cout << endl;
	// ciphertext_sha256(xh, xe);
	// mpz_out_str(stdout, 16, xh);
	// cout << endl;
	// cout << "It works!" << endl;
	cout << "Welcome! ";
	// Read the public key from a file.
	int numCandidates, numVoters;
	string electionName, electionEmailAddress;
	paillier_pubkey_t* pub = NULL;
	int pubkeyStatus = read_pubkey_from_file(numCandidates, numVoters, &pub, electionName, electionEmailAddress);
	if(pubkeyStatus == PUBKEY_NO_FILE){
		cerr << "Error: could not read public key file.\n";
		return 1;
	}
	if(pubkeyStatus != PUBKEY_OK){
		cerr << "The numbers of candidates and of voters are corrupt.\n";
		return 2;
	}
	// Prompt the user for the voter token. The token should be represented as a base 10 number.
	// There may be dashes every few digits to make it easier for the user to enter, but they
	// will be removed from the string here.
	string strVoterToken;
	cout << "Please enter your voter ID code (dashes optional):\n>>> ";
	cout.flush();
	cin >> strVoterToken;
	// Remove hyphens from the voter token.
	if(!sanitize_voter_token(strVoterToken)){
		// Non-numeric characters, other than hyphens, were found!
		cerr << "The voter ID code should contain numbers only. Hyphens are acceptable but ignored.\n";
		return 3;
	}
	// Convert the base 10 string into a GMP integer.
	mpz_t zVoterToken;
	if(mpz_init_set_str(zVoterToken, strVoterToken.c_str(), 10) == -1){
		cerr << "Fatal error: the integer parsing failed.\n";
		return 4;
	}
	// Make sure that the token is at most TOKEN_LENGTH bits long.
	if(mpz_sizeinbase(zVoterToken, 2) > TOKEN_LENGTH){
		cerr << "Error: That token seems to be too big.\n";
		return 5;
	}
	cout << "Your token was successfully verified to be a number. Note that this program does not check whether your token was\n"
		<< "actually issued by the election authority. Once your vote is submitted, the election authority should send you a\n"
		<< "confirmation. If you do not receive a confirmation, please contact the election authority.\n";
	// Prompt the user to choose a candidate.
	char confirmation;
	int zCandidate;
	do {
		cout << '\n'
			<< "Please pick a candidate between 1 and " << numCandidates << ", inclusive. If you do not know who the candidates are, please contact\n"
			<< "your election authority.\n"
			<< "Enter the number of the candidate that you want to vote for: ";
		cout.flush();
		cin >> zCandidate;
		if(0 < zCandidate && zCandidate <= numCandidates){
			cout << "You picked candidate " << zCandidate << ". Are you sure? (Y/N): ";
			cout.flush();
			cin >> confirmation;
		}else{
			cout << "That was not one of the choices.\n";
			confirmation = 'n';
		}
		while(cin.get() != '\n');
	}while(confirmation != 'y' && confirmation != 'Y');
	cout << '\n';
	// The vote is stored as {number of voters}^{# of candidate - 1}.
	paillier_plaintext_t* ptVote = paillier_plaintext_from_ui(numVoters + 1);
	mpz_pow_ui(ptVote->m, ptVote->m, zCandidate - 1);
	// cout << "Your vote is encoded (but not encrypted) as: ";
	// mpz_out_str(stdout, 10, ptVote->m);
	// cout << '\n' << endl;
	// Encrypt the vote.
	paillier_ciphertext_t* ctVote = paillier_enc(NULL, pub, ptVote, paillier_get_rand_devurandom);
	// Get the HMAC-SHA256 of the ciphertext, keyed with the voter token. A plain SHA-256 sum
	// would let anyone who swaps the ballot adjust the encrypted value below to match.
	mpz_t checksum;
	ciphertext_hmac_sha256(checksum, ctVote, zVoterToken);
	// Create an authenticity value, which is the voter token bitshifted 256 bits to the left + the HMAC.
	paillier_plaintext_t* ptAuthentic = paillier_plaintext_from_ui(0);
	mpz_mul_2exp(ptAuthentic->m, zVoterToken, 256);
	mpz_add(ptAuthentic->m, ptAuthentic->m, checksum);
	// Encrypt the authenticity value.
	paillier_ciphertext_t* ctAuthentic = paillier_enc(NULL, pub, ptAuthentic, paillier_get_rand_devurandom);
	// Print the envelope. Other programs read these BEGIN/END blocks, so keep the format as is.
	print_envelope(cout, ctVote, ctAuthentic);
	// Also write the envelope into an e-mail that can be sent with ssmtp.
	ofstream ofsEmail(EMAIL_TXT);
	if(ofsEmail){
		if(!electionEmailAddress.empty()){
			ofsEmail << "To: " << electionEmailAddress << '\n';
		}
		ofsEmail << "Subject: " << EMAIL_SUBJECT_PREFIX << electionName << "\n\n";
		print_envelope(ofsEmail, ctVote, ctAuthentic);
		ofsEmail.close();
		cout << "\nYour vote was encrypted and saved to " << EMAIL_TXT << ".\n";
		if(!electionEmailAddress.empty()){
			cout << "To send it, run:\n    ssmtp " << electionEmailAddress << " <" << EMAIL_TXT << endl;
		}else{
			cout << "Send that file to your election authority by e-mail." << endl;
		}
	}else{
		cerr << "Warning: " << EMAIL_TXT << " could not be created. Send the BALLOT and MAC blocks above"
			<< " by e-mail with the subject \"" << EMAIL_SUBJECT_PREFIX << electionName << "\".\n";
	}
	// Clean up.
	// TODO: also clean up when something fails above
	mpz_clear(zVoterToken);
	mpz_clear(checksum);
	paillier_freepubkey(pub);
	paillier_freeplaintext(ptVote);
	paillier_freeciphertext(ctVote);
	paillier_freeplaintext(ptAuthentic);
	paillier_freeciphertext(ctAuthentic);
	return 0;
}

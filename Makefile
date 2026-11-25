CC=g++
# Flags for compiling. Libraries are only needed when linking, so they are in CLINK.
CFLAGS=-Wall -Werror -O2 -g -std=c++11
CLINK=-lpaillier -lgmp -lcryptopp
PARTS=\
	CryptoCommon\

PROGRAMS=cast-vote admin-keygen admin-tokens tally-votes

# Files created while running an election. The private key cannot be recovered once deleted.
ELECTION_FILES=private-key.txt public-key.txt tokens.txt email.txt votes.txt votes-downloaded.txt

.PHONY: all clean election-reset

all: $(PROGRAMS)

%.o: %.cpp $(foreach part, $(PARTS), $(part).h) paillier.h
	$(CC) $< -c -o $@ $(CFLAGS)

$(PROGRAMS): %: $(foreach part, $(PARTS), $(part).o) %.o
	$(CC) $(foreach part, $(PARTS), $(part).o) $@.o -o $@ $(CFLAGS) $(CLINK)

tests: paillier.h tests.cpp
	$(CC) tests.cpp -o tests $(CFLAGS) $(CLINK)

# The .exe names are for builds on Windows (MSYS2).
clean:
	rm -f $(foreach part, $(PARTS), $(part).o)\
		tests $(PROGRAMS) $(addsuffix .o, $(PROGRAMS))\
		tests.exe $(addsuffix .exe, $(PROGRAMS))

# Deletes the current election so that a new one can be set up. Asks first, because without
# the private key the votes that were already cast can never be tallied.
election-reset:
	@printf "This deletes the keys, tokens and votes of the current election. Continue? [y/N] "; \
	read answer; \
	if [ "$$answer" = "y" ] || [ "$$answer" = "Y" ]; then \
		rm -f $(ELECTION_FILES); \
		echo "The election files were deleted."; \
	else \
		echo "Nothing was deleted."; \
	fi

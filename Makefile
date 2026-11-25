CC=g++
# Flags for compiling. Libraries are only needed when linking, so they are in CLINK.
CFLAGS=-Wall -Werror -O2 -g -std=c++11
CLINK=-lpaillier -lgmp -lcryptopp
PARTS=\
	CryptoCommon\

PROGRAMS=cast-vote admin-keygen admin-tokens tally-votes

.PHONY: all clean

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

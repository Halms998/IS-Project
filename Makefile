CC=g++
CFLAGS=-Wall -Werror -g -fvar-tracking -std=c++11 -lpaillier -lgmp -lcryptopp
PARTS=\
	CryptoCommon\

%.o: %.cpp $(foreach part, $(PARTS), $(part).h) paillier.h
	$(CC) $< -c -o $@ $(CFLAGS)

tests: paillier.h tests.cpp
	$(CC) tests.cpp -o tests $(CFLAGS)

clean:
	rm $(foreach part, $(PARTS), $(part).o) tests; true

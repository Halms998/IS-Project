#!/usr/bin/env python3
"""Downloads encrypted votes from an IMAP mailbox.

Only e-mails whose subject is "Vote: <name of election>" are read, so an existing
mailbox can be used. The bodies are saved to votes-downloaded.txt, which can then be
passed to tally-votes:

    ./tally-votes <votes-downloaded.txt
"""
import email
import getpass
import imaplib
import sys

OUTPUT_FILENAME = "votes-downloaded.txt"
PUBLIC_KEY_FILENAME = "public-key.txt"
SUBJECT_PREFIX = "Vote: "


def election_name_from_public_key():
    """Returns the election name stored on line 4 of the public key file, or None."""
    try:
        with open(PUBLIC_KEY_FILENAME) as public_key:
            lines = public_key.read().splitlines()
    except OSError:
        return None
    if len(lines) >= 4 and lines[3].strip():
        return lines[3].strip()
    return None


def plain_text_part(message):
    """Returns the first text/plain part of a message, or None.

    E-mail programs often send a multipart message with both a plain text and an HTML
    version of the body, sometimes nested inside another multipart part. walk() visits
    every part, so nested ones are found too.
    """
    for part in message.walk():
        if part.get_content_type().lower() == "text/plain":
            return part
    return None


def main():
    print("This script will download encrypted votes from an IMAP mailbox.")
    if len(sys.argv) not in (3, 4):
        print("Usage: imap-get-votes.py [IMAP server] [IMAP username] [name of election]")
        print("The IMAP server should support SSL on port 993.")
        print("If the name of the election is left out, it is read from " + PUBLIC_KEY_FILENAME + ".")
        print("The name of the election should not contain quotation marks or exclamation points.")
        return 1
    server, username = sys.argv[1], sys.argv[2]
    election_name = sys.argv[3] if len(sys.argv) == 4 else election_name_from_public_key()
    if not election_name:
        print("Could not find the name of the election. Pass it as the third argument.")
        return 1
    # Establish a connection to the IMAP server and log in.
    mailbox = imaplib.IMAP4_SSL(host=server)
    mailbox.login(username, getpass.getpass("Enter IMAP password: "))
    print()
    saved = 0
    try:
        # Navigate into the inbox.
        mailbox.select()
        # Open a file to save the votes in.
        with open(OUTPUT_FILENAME, "w") as votes_downloaded:
            # Search for and download votes.
            typ, data = mailbox.search(None, "SUBJECT", '"' + SUBJECT_PREFIX + election_name + '"')
            for num in data[0].split():
                # Fetch the message.
                typ, data = mailbox.fetch(num, "(RFC822)")
                # Decode the message.
                message = email.message_from_bytes(data[0][1])
                sender = message.get("From", "unknown party")
                # If the message is a multipart message, use the part in plain text.
                part = plain_text_part(message)
                if part is None:
                    print("Skipping a message from ", sender, ": it has no text/plain part.", sep="")
                    continue
                body = part.get_payload(decode=True)
                if body is None:
                    print("Skipping a message from ", sender, ": its text/plain part is empty.", sep="")
                    continue
                # Write the vote to the file. tally-votes ignores the "Vote from" line.
                print("Saving vote from ", sender, "...", sep="")
                votes_downloaded.write("Vote from " + sender + "\n")
                text = body.replace(b"\r\n", b"\n").replace(b"\r", b"\n").decode("utf-8", errors="replace")
                votes_downloaded.write(text + "\n")
                saved += 1
    finally:
        mailbox.close()
        mailbox.logout()
    print("\nSaved", saved, "e-mail(s) to", OUTPUT_FILENAME)
    print("Run `./tally-votes <", OUTPUT_FILENAME, "` to tally the votes.", sep="")
    return 0


if __name__ == "__main__":
    sys.exit(main())

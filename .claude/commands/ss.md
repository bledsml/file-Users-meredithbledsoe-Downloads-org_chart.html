---
description: Grab the most recently uploaded/taken screenshot and analyze it
allowed-tools: Bash(find:*), Bash(ls:*), Bash(stat:*), Read
---

Find the single most recently modified image file across the locations where an
uploaded or freshly-taken screenshot could land, print its path, then read and
describe it.

Newest image found (path on the last line, empty if none):

!`for d in "$HOME/.claude/uploads" /root/.claude/uploads "$HOME/Desktop" "$HOME/Downloads" "$HOME/Pictures" "$HOME/Pictures/Screenshots" "$HOME/Pictures/Screenshot" /mnt/user-data; do [ -d "$d" ] && find "$d" -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) -printf '%T@\t%p\n' 2>/dev/null; done | sort -rn | head -1 | cut -f2-`

Now do the following:
1. If the line above is empty, tell me no screenshot was found and ask me to
   attach it to a message (the paperclip / drag-and-drop), since this cloud
   session can only see images that have been uploaded to the chat.
2. Otherwise, **Read that exact file path** so the image is loaded.
3. Describe what's on screen, focused on the dog-grooming booking flow at
   Pet Wants ATL Metro South: which step it is (service picker, stylist picker,
   date/time calendar, details form, confirmation), the exact visible labels and
   button text, any available vs. greyed-out dates, and anything I'd need to wire
   up the booking automation's clicks (`preSteps`) and selectors.

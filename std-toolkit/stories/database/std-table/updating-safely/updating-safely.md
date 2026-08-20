# Updating safely

Change part of a note. Do not read all of it first.

`getAndUpdate` accepts a key and only the fields that change. The other fields
keep their values. The update stamp moves forward.

Two protections come with it. An update can carry a condition that stops it
before any write happens. And the key of a note cannot change. To move a note,
write it under the new key and delete the old one.

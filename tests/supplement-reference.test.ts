import assert from "node:assert/strict";
import test from "node:test";
import { lookupSupplementReferenceNote } from "../lib/supplements/reference";

test("lookupSupplementReferenceNote matches known supplements case-insensitively and regardless of Turkish diacritics", () => {
  assert.ok(lookupSupplementReferenceNote("D Vitamini")?.note.length);
  assert.ok(lookupSupplementReferenceNote("d vitamini")?.note.length);
  assert.equal(lookupSupplementReferenceNote("Çinko")?.note, lookupSupplementReferenceNote("cinko")?.note);
});

test("lookupSupplementReferenceNote returns null for an unrecognized or free-text name", () => {
  assert.equal(lookupSupplementReferenceNote("Marka XYZ Özel Karışım"), null);
  assert.equal(lookupSupplementReferenceNote(""), null);
});

test("every reference note is purely informational and contains no dosage or treatment instruction", () => {
  const bannedWords = ["mg al", "doz", "günde", "kullanmalı", "tedavi"];
  for (const key of ["d vitamini", "b12", "demir", "magnezyum", "omega 3", "multivitamin", "probiyotik", "cinko", "kalsiyum", "c vitamini"]) {
    const note = lookupSupplementReferenceNote(key);
    assert.ok(note, `expected a note for ${key}`);
    const lower = note!.note.toLocaleLowerCase("tr-TR");
    for (const banned of bannedWords) assert.ok(!lower.includes(banned), `${key}'s note should not contain "${banned}"`);
  }
});

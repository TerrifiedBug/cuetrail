'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDescription, sectionAt, normalizeUrl } = require('../model.js');

function section(start, title, urls = []) {
  return { start, title, urls };
}

test('chapter links belong to their timestamps, including a linkless intro', function () {
  const description = [
    'Subscribe: https://example.com/preamble',
    '',
    '00:00 Intro',
    '02:30 Math — https://example.com/math',
    '02:46 Open instinct',
    'Project: https://example.com/instinct',
    'Documentation: https://example.com/docs',
    '03:10 Conclusion',
    '',
    'Socials: https://example.com/footer'
  ].join('\n');
  assert.deepEqual(parseDescription(description), [
    section(0, 'Intro'),
    section(150, 'Math', ['https://example.com/math']),
    section(166, 'Open instinct', ['https://example.com/instinct', 'https://example.com/docs']),
    section(190, 'Conclusion')
  ]);
});

test('blank lines close continuation and promotional URLs never enter the final section', function () {
  assert.deepEqual(parseDescription([
    '00:00 First https://example.com/first',
    '00:30 Final https://example.com/final',
    'https://example.com/extra',
    '   ',
    'Support the channel https://example.com/support',
    'https://example.com/social',
    '',
    '00:45 Later',
    'https://example.com/later'
  ].join('\n')), [
    section(0, 'First', ['https://example.com/first']),
    section(30, 'Final', ['https://example.com/final', 'https://example.com/extra']),
    section(45, 'Later', ['https://example.com/later'])
  ]);
});

test('a linkless chapter never borrows the preceding chapter link', function () {
  const sections = parseDescription('00:00 Linked https://example.com/\n00:10 No link\n00:20 Linked again https://example.org/');
  assert.deepEqual(sectionAt(sections, 10, 30), section(10, 'No link'));
  assert.deepEqual(sectionAt(sections, 19.999, 30), section(10, 'No link'));
});

test('accepts bracketed timestamps, hours, bullets, and title separators', function () {
  assert.deepEqual(parseDescription([
    '[00:00] | Intro |',
    '(01:02) — Two — https://example.com/two',
    '• 1:02:03 - Hour',
    '65:10: Long minutes',
    '* 02:00-No space',
    '03:00: Colon title'
  ].join('\r\n')), [
    section(0, 'Intro'),
    section(62, 'Two', ['https://example.com/two']),
    section(120, 'No space'),
    section(180, 'Colon title'),
    section(3723, 'Hour'),
    section(3910, 'Long minutes')
  ]);
});

test('sorts timestamps and merges duplicate chapter URLs in description order', function () {
  assert.deepEqual(parseDescription([
    '01:00 Later https://example.com/b',
    '00:00 https://example.com/a',
    '01:00 Duplicate https://example.com/b https://example.com/c',
    'https://example.com/d',
    '00:00 Intro https://example.com/a https://example.com/e'
  ].join('\n')), [
    section(0, 'Intro', ['https://example.com/a', 'https://example.com/e']),
    section(60, 'Later', ['https://example.com/b', 'https://example.com/c', 'https://example.com/d'])
  ]);
});

test('deduplicates normalized links on the same line and subsequent lines', function () {
  assert.deepEqual(parseDescription('00:00 Links https://EXAMPLE.com https://example.com/\nhttps://example.com/'), [
    section(0, 'Links', ['https://example.com/'])
  ]);
});

test('trims URL prose punctuation while preserving balanced parentheses', function () {
  assert.deepEqual(parseDescription('00:00 References — https://example.com/a_(b). https://example.org/item), https://example.net/path?!'), [
    section(0, 'References', ['https://example.com/a_(b)', 'https://example.org/item', 'https://example.net/path'])
  ]);
  assert.equal(normalizeUrl('https://example.com/nested_(a_(b))'), 'https://example.com/nested_(a_(b))');
  assert.equal(normalizeUrl('https://example.com/nested_(a_(b))).'), 'https://example.com/nested_(a_(b))');
  assert.equal(normalizeUrl('https://example.com/%29'), 'https://example.com/%29');
});

test('rejects malformed timestamps instead of creating false chapters', function () {
  const malformed = ['1:2', '00:60', '1:60:00', '1:00:60', '1:2:03', '1:02:3', '1:02:03:04', '9007199254740992:00'];
  for (const timestamp of malformed) {
    assert.deepEqual(parseDescription(timestamp + ' Invalid https://example.com/'), [], timestamp);
  }
});

test('a malformed timestamp closes previous URL continuation', function () {
  assert.deepEqual(parseDescription('00:00 Valid\n00:99 Invalid https://example.com/wrong\nhttps://example.com/also-wrong\n00:20 Next'), [
    section(0, 'Valid'),
    section(20, 'Next')
  ]);
});

test('preamble, inline time mentions, and empty descriptions do not create chapters', function () {
  assert.deepEqual(parseDescription('Find the link at 01:30 https://example.com/'), []);
  assert.deepEqual(parseDescription('https://example.com/\nNo chapters here'), []);
  assert.deepEqual(parseDescription(''), []);
  assert.deepEqual(parseDescription(null), []);
});

test('unsafe HTTP credentials never become chapter links or title text', function () {
  assert.deepEqual(parseDescription('00:00 Example https://user:secret@example.com/ https://example.com/safe'), [
    section(0, 'Example', ['https://example.com/safe'])
  ]);
});

test('redirect links use their destination and are deduplicated with direct links', function () {
  assert.deepEqual(parseDescription('00:00 Project https://www.youtube.com/redirect?q=https%3A%2F%2Fexample.com%2Fproject\nhttps://example.com/project'), [
    section(0, 'Project', ['https://example.com/project'])
  ]);
});

test('section lookup has exact start-inclusive, end-exclusive boundaries', function () {
  const sections = [section(5, 'One'), section(10, 'Two'), section(20, 'Three')];
  assert.equal(sectionAt(sections, 0, 30), null);
  assert.equal(sectionAt(sections, 4.999, 30), null);
  assert.equal(sectionAt(sections, 5, 30), sections[0]);
  assert.equal(sectionAt(sections, 9.999, 30), sections[0]);
  assert.equal(sectionAt(sections, 10, 30), sections[1]);
  assert.equal(sectionAt(sections, 19.999, 30), sections[1]);
  assert.equal(sectionAt(sections, 20, 30), sections[2]);
  assert.equal(sectionAt(sections, 29.999, 30), sections[2]);
  assert.equal(sectionAt(sections, 30, 30), null);
  assert.equal(sectionAt(sections, 31, 30), null);
});

test('finite playback duration caps lookup even when chapters extend beyond it', function () {
  const sections = [section(0, 'One'), section(100, 'Beyond duration')];
  assert.equal(sectionAt(sections, 49, 50), sections[0]);
  assert.equal(sectionAt(sections, 50, 50), null);
  assert.equal(sectionAt(sections, 100, 50), null);
  assert.equal(sectionAt(sections, 0, 0), null);
});

test('unknown duration does not invent an end for the last chapter', function () {
  const sections = [section(0, 'One')];
  assert.equal(sectionAt(sections, 100), sections[0]);
  assert.equal(sectionAt(sections, 100, NaN), sections[0]);
  assert.equal(sectionAt(sections, 100, Infinity), sections[0]);
});

test('invalid playback times and empty chapter lists have no section', function () {
  for (const time of [-1, NaN, Infinity, -Infinity, '1', null]) {
    assert.equal(sectionAt([section(0, 'One')], time, 30), null);
  }
  assert.equal(sectionAt([], 0, 30), null);
  assert.equal(sectionAt(null, 0, 30), null);
});

test('normalizes only absolute HTTP(S) destinations', function () {
  assert.equal(normalizeUrl('  HTTPS://Example.COM/path?q=one%20two#part  '), 'https://example.com/path?q=one%20two#part');
  assert.equal(normalizeUrl('http://example.com'), 'http://example.com/');
  for (const raw of ['javascript:alert(1)', 'data:text/html,hi', 'file:///tmp/a', 'ftp://example.com/', 'chrome://settings', '//example.com/', '/relative', 'https:example.com', '', null, 42]) {
    assert.equal(normalizeUrl(raw), null, String(raw));
  }
});

test('rejects credentials, malformed URLs, and embedded whitespace or controls', function () {
  for (const raw of ['https://user@example.com/', 'https://user:pass@example.com/', 'https://:pass@example.com/', 'https://', 'https://[bad]/', 'https://exam\nple.com/', 'https://example.com/a b', 'https://example.com/\u0000']) {
    assert.equal(normalizeUrl(raw), null, raw);
  }
});

test('unwraps recognized YouTube redirect q exactly once', function () {
  assert.equal(normalizeUrl('https://www.youtube.com/redirect?event=video_description&q=https%3A%2F%2Fexample.com%2Fpath%3Fx%3Done%2520two%26y%3D2'), 'https://example.com/path?x=one%20two&y=2');
  assert.equal(normalizeUrl('/redirect?q=https%3A%2F%2Fexample.com%2F'), 'https://example.com/');
  assert.equal(normalizeUrl('https://youtube.com/redirect?q=http%3A%2F%2Fexample.com%2F'), 'http://example.com/');
  assert.equal(normalizeUrl('https://www.youtube.com/redirect?q=https%253A%252F%252Fexample.com'), null);
});

test('rejects unsafe redirect destinations and missing q values', function () {
  for (const target of ['javascript:alert(1)', 'data:text/html,hello', '//example.com/', 'https://user:pass@example.com/']) {
    assert.equal(normalizeUrl('https://www.youtube.com/redirect?q=' + encodeURIComponent(target)), null, target);
  }
  assert.equal(normalizeUrl('https://www.youtube.com/redirect?event=description'), null);
  assert.equal(normalizeUrl('https://www.youtube.com/redirect?q='), null);
});

test('does not unwrap lookalike redirect hosts or unrelated YouTube paths', function () {
  assert.equal(normalizeUrl('https://youtube.com.evil.example/redirect?q=https%3A%2F%2Fexample.com'), 'https://youtube.com.evil.example/redirect?q=https%3A%2F%2Fexample.com');
  assert.equal(normalizeUrl('https://www.youtube.com/watch?v=abc&q=https%3A%2F%2Fexample.com'), 'https://www.youtube.com/watch?v=abc&q=https%3A%2F%2Fexample.com');
});
